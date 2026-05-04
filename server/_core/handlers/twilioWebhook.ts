import type { Request, Response } from "express";
import {
  validateTwilioSignature,
  sendMessage,
  extractChannel,
  normalizePhone,
} from "../twilio";
import {
  runIntake,
  AIParseError,
  STATIC_FALLBACK_REPLY,
  type ExtractedFields,
  type IntakeResult,
  type RiskFlag,
} from "../ai";
import { transition, isNewlyQualified, isNewlyHandoff } from "../stateMachine";
import { appendBookingLink, createCalendarEvent } from "../calendar";
import {
  applyFieldConflictToIntakeResult,
  buildSmsSafetyHandoffResult,
  classifyInboundSmsSafety,
  coerceExtractedFields,
  detectFieldConflicts,
} from "../smsSafety";
import { ENV } from "../env";
import {
  getAccountByTwilioPhone,
  getAccountByWhatsAppPhone,
  getOrCreateConversationForInboundWebhook,
  updateConversation,
  getMessagesByConversation,
  createMessage,
  createLeadLog,
  createNotification,
  createFollowUpJob,
  cancelFollowUpJobsForConversation,
} from "../../db";

/**
 * Reconstruct the webhook URL exactly as Twilio sees it.
 * WEBHOOK_BASE_URL must match the URL entered in the Twilio console (protocol + host, no trailing slash).
 * Falls back to the inferred request URL for local dev with ngrok.
 */
function getWebhookUrl(req: Request): string {
  const base =
    ENV.webhookBaseUrl ||
    `${req.headers["x-forwarded-proto"] ?? req.protocol}://${req.headers["x-forwarded-host"] ?? req.get("host")}`;
  return `${base}${req.originalUrl}`;
}

function mergeExtractedFieldsForState(
  previousFields: Partial<ExtractedFields>,
  nextFields: ExtractedFields,
  conflictFields: Array<keyof ExtractedFields> = []
): ExtractedFields {
  const merged = { ...previousFields, ...nextFields } as ExtractedFields;

  for (const field of conflictFields) {
    const previousValue = previousFields[field];
    if (previousValue === undefined) {
      delete merged[field];
    } else {
      merged[field] = previousValue as never;
    }
  }

  return merged;
}

function parseRiskFlags(value: string | null): RiskFlag[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as RiskFlag[]) : [];
  } catch {
    return [];
  }
}

/**
 * POST /api/webhook/twilio
 *
 * Full processing pipeline:
 *   validate sig → detect channel → find account → upsert conversation → persist user msg
 *   → call AI → transition state → persist assistant msg → lead/notification
 *   → schedule follow-ups → send SMS/WhatsApp reply → respond 200 TwiML
 *
 * Always returns 200 to Twilio (non-2xx causes retries).
 * Errors in the AI or SMS paths fall back to a static reply so the
 * customer always gets a response.
 */
export async function handleTwilioWebhook(
  req: Request,
  res: Response
): Promise<void> {
  const params = req.body as Record<string, string>;
  const signature = (req.headers["x-twilio-signature"] as string) ?? "";
  const url = getWebhookUrl(req);

  // 1. Validate Twilio signature — reject forged requests early
  if (!validateTwilioSignature(url, params, signature)) {
    console.warn(
      "[Webhook] Rejected: invalid Twilio signature. URL used:",
      url
    );
    res.status(403).send("Forbidden");
    return;
  }

  const rawFrom = params.From ?? "";
  const rawTo = params.To ?? "";
  const messageBody = (params.Body ?? "").trim();
  const messageSid = params.MessageSid ?? "";

  if (!rawFrom || !rawTo) {
    res.status(400).send("Missing From or To");
    return;
  }

  // 2. Detect channel and normalize phone numbers
  const channel = extractChannel(rawFrom);
  const fromPhone = normalizePhone(rawFrom);
  const toPhone = normalizePhone(rawTo);

  // 3. Route to the correct operator account
  const account =
    channel === "whatsapp"
      ? await getAccountByWhatsAppPhone(toPhone)
      : await getAccountByTwilioPhone(toPhone);

  if (!account) {
    console.warn(
      `[Webhook] No account registered for ${channel} phone ${toPhone}`
    );
    res
      .set("Content-Type", "text/xml")
      .status(200)
      .send("<Response></Response>");
    return;
  }

  // 4. Gate and upsert conversation (one per customer phone per account)
  const gatedConversation = await getOrCreateConversationForInboundWebhook({
    account,
    customerPhone: fromPhone,
    channel,
  });

  if (!gatedConversation.allowed) {
    console.warn(
      `[Webhook] Billing gate blocked ${channel} from ${fromPhone} for account ${account.id}: ${gatedConversation.gate.reason}`
    );

    const fromNumber =
      channel === "whatsapp"
        ? account.whatsappPhoneNumber
        : account.twilioPhoneNumber;
    if (fromNumber) {
      try {
        await sendMessage(
          channel,
          fromPhone,
          gatedConversation.gate.customerMessage,
          fromNumber
        );
      } catch (smsErr) {
        console.error("[Webhook] Failed to send billing gate reply:", smsErr);
      }
    }

    res
      .set("Content-Type", "text/xml")
      .status(200)
      .send("<Response></Response>");
    return;
  }

  const conversation = gatedConversation.conversation;

  // 5. Persist the inbound user message and cancel pending follow-ups (they replied)
  await createMessage({
    conversationId: conversation.id,
    role: "user",
    body: messageBody,
  });
  await updateConversation(conversation.id, { lastUserMessageAt: new Date() });
  await cancelFollowUpJobsForConversation(conversation.id);

  // 6. Build conversation history for the AI (cap at 20 messages to control token usage)
  const allMessages = await getMessagesByConversation(conversation.id);
  // Exclude the message we just inserted (last entry) — it's passed as the new turn
  const priorMessages = allMessages.slice(-21, -1);
  const historyForAI = priorMessages.map(m => ({
    role: m.role as "user" | "assistant",
    content: m.body,
  }));
  const previousExtractedFields = coerceExtractedFields(
    conversation.currentState
  );
  const previousRiskFlags = parseRiskFlags(conversation.riskFlags);

  // 7. Run AI engine — falls back to static reply on any error
  let intakeResult: IntakeResult;
  let parseError = false;
  let replyText = STATIC_FALLBACK_REPLY;
  const smsSafetyAssessment = classifyInboundSmsSafety(messageBody);
  const smsSafetyResult = buildSmsSafetyHandoffResult(
    smsSafetyAssessment,
    previousExtractedFields
  );

  if (smsSafetyResult) {
    intakeResult = smsSafetyResult;
  } else {
    try {
      intakeResult = await runIntake(account, historyForAI, messageBody);
    } catch (err) {
      parseError = true;
      if (err instanceof AIParseError) {
        console.error("[Webhook] AI parse error:", err.message, err.raw);
      } else {
        console.error("[Webhook] Unexpected AI error:", err);
      }
      intakeResult = {
        replyText: STATIC_FALLBACK_REPLY,
        status: "new",
        nextAction: "wait_for_user",
        shouldSendReply: true,
        shouldHandoff: false,
        shouldReject: false,
        extractedFields: {},
        missingFields: [],
        riskFlags: ["none"],
        handoffReason: "none",
        rejectionReason: "none",
        confidence: { overall: 0 },
      };
    }
  }

  if (!smsSafetyResult && !previousRiskFlags.includes("field_conflict")) {
    const conflictAssessment = detectFieldConflicts(
      previousExtractedFields,
      intakeResult.extractedFields
    );
    if (conflictAssessment.hasConflict) {
      intakeResult = applyFieldConflictToIntakeResult(
        intakeResult,
        conflictAssessment
      );
      intakeResult.extractedFields = mergeExtractedFieldsForState(
        previousExtractedFields,
        intakeResult.extractedFields,
        conflictAssessment.fieldsToConfirm
      );
    } else {
      intakeResult.extractedFields = mergeExtractedFieldsForState(
        previousExtractedFields,
        intakeResult.extractedFields
      );
    }
  } else if (!smsSafetyResult) {
    intakeResult.extractedFields = mergeExtractedFieldsForState(
      previousExtractedFields,
      intakeResult.extractedFields
    );
  }
  replyText = intakeResult.replyText;

  // 8. Run state machine transition (pure, no side effects)
  const prevStatus = conversation.status;
  const nextStatus = transition(prevStatus, intakeResult);

  // 9. Append Calendly booking link when the lead qualifies
  if (
    intakeResult.nextAction === "confirm_details" ||
    nextStatus === "qualified"
  ) {
    replyText = appendBookingLink(replyText, account);
  }

  // 10. Persist assistant message with all extracted metadata
  await createMessage({
    conversationId: conversation.id,
    role: "assistant",
    body: replyText,
    parseError,
    schemaValid: !parseError,
    nextAction: intakeResult.nextAction,
    missingFields: JSON.stringify(intakeResult.missingFields),
    extractedFields: intakeResult.extractedFields,
    confidenceOverall: intakeResult.confidence.overall,
    notesForManager: intakeResult.notesForManager,
  });

  // 11. Persist updated conversation state
  await updateConversation(conversation.id, {
    status: nextStatus,
    currentState: intakeResult.extractedFields as any,
    riskFlags: JSON.stringify(intakeResult.riskFlags),
    shouldHandoff: intakeResult.shouldHandoff,
    shouldReject: intakeResult.shouldReject,
    lastAgentMessageAt: new Date(),
    ...(nextStatus === "handoff_needed"
      ? { handoffReason: intakeResult.handoffReason }
      : {}),
    ...(nextStatus === "rejected"
      ? { rejectionReason: intakeResult.rejectionReason }
      : {}),
  });

  // 12. Side effects on key state transitions

  if (isNewlyQualified(prevStatus, nextStatus)) {
    const lead = await createLeadLog({
      accountId: account.id,
      conversationId: conversation.id,
      inboundMessageId: messageSid,
      status: "qualified",
      nextAction: "book",
      extractedFields: intakeResult.extractedFields,
      missingFields: JSON.stringify(intakeResult.missingFields),
      riskFlags: JSON.stringify(intakeResult.riskFlags),
      notesForManager: intakeResult.notesForManager,
      replyText,
    });

    await createNotification({
      accountId: account.id,
      userId: account.userId,
      type: "new_lead",
      title: "New qualified lead",
      content: `${fromPhone} is ready to book${intakeResult.extractedFields.bookingType ? ` — ${intakeResult.extractedFields.bookingType.replace(/_/g, " ")}` : ""}`,
      leadId: lead.id,
      conversationId: conversation.id,
    });

    // Create Google Calendar event (non-blocking)
    createCalendarEvent(account, intakeResult.extractedFields).catch(err =>
      console.error("[Webhook] Calendar event creation error:", err)
    );

    // Schedule appointment reminders if we have an event date
    if (account.followUpEnabled && intakeResult.extractedFields.eventDate) {
      const eventDate = new Date(intakeResult.extractedFields.eventDate);
      const now = new Date();
      const reminder24h = new Date(eventDate.getTime() - 24 * 3600 * 1000);
      const reminder1h = new Date(eventDate.getTime() - 1 * 3600 * 1000);

      if (reminder24h > now) {
        await createFollowUpJob({
          accountId: account.id,
          conversationId: conversation.id,
          customerPhone: fromPhone,
          channel,
          jobType: "appointment_reminder_24h",
          scheduledAt: reminder24h,
        });
      }
      if (reminder1h > now) {
        await createFollowUpJob({
          accountId: account.id,
          conversationId: conversation.id,
          customerPhone: fromPhone,
          channel,
          jobType: "appointment_reminder_1h",
          scheduledAt: reminder1h,
        });
      }
    }
  }

  if (isNewlyHandoff(prevStatus, nextStatus)) {
    const lead = await createLeadLog({
      accountId: account.id,
      conversationId: conversation.id,
      inboundMessageId: messageSid,
      status: "handoff_needed",
      handoffReason:
        intakeResult.handoffReason !== "none"
          ? intakeResult.handoffReason
          : "unusual_request",
      riskFlags: JSON.stringify(intakeResult.riskFlags),
      notesForManager: intakeResult.notesForManager,
    });

    await createNotification({
      accountId: account.id,
      userId: account.userId,
      type: "new_lead",
      title: "Customer needs immediate help",
      content: `${fromPhone} has been flagged for human handoff`,
      leadId: lead.id,
      conversationId: conversation.id,
    });
  }

  // 13. Schedule no-reply follow-ups when we enter collecting_details for the first time
  if (
    account.followUpEnabled &&
    nextStatus === "collecting_details" &&
    prevStatus !== "collecting_details"
  ) {
    const now = new Date();
    await createFollowUpJob({
      accountId: account.id,
      conversationId: conversation.id,
      customerPhone: fromPhone,
      channel,
      jobType: "no_reply_2h",
      scheduledAt: new Date(now.getTime() + 2 * 3600 * 1000),
    });
    await createFollowUpJob({
      accountId: account.id,
      conversationId: conversation.id,
      customerPhone: fromPhone,
      channel,
      jobType: "no_reply_24h",
      scheduledAt: new Date(now.getTime() + 24 * 3600 * 1000),
    });
  }

  // 14. Send SMS or WhatsApp reply
  if (!intakeResult.shouldSendReply) {
    console.info(
      `[Webhook] Skipping reply — shouldSendReply=false for conversation ${conversation.id}`
    );
  } else {
    const fromNumber =
      channel === "whatsapp"
        ? account.whatsappPhoneNumber
        : account.twilioPhoneNumber;

    if (fromNumber) {
      try {
        await sendMessage(channel, fromPhone, replyText, fromNumber);
      } catch (smsErr) {
        console.error("[Webhook] Failed to send reply:", smsErr);
      }
    } else {
      console.warn(
        `[Webhook] Account ${account.id} has no ${channel} phone number — reply not sent`
      );
    }
  }

  // 15. Respond to Twilio with empty TwiML (reply already sent via REST)
  res.set("Content-Type", "text/xml").status(200).send("<Response></Response>");
}
