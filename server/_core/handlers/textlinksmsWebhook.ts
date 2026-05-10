import type { Request, Response } from "express";
import { sendSms, verifyWebhookSecret } from "../textlinksms";
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
import {
  getDefaultAccount,
  getOrCreateConversationForInboundWebhook,
  updateConversation,
  getMessagesByConversation,
  createMessage,
  createLeadLog,
  createNotification,
  createFollowUpJob,
  cancelFollowUpJobsForConversation,
} from "../../db";

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

function generateMessageSid(): string {
  return `textlink_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function handleTextLinkSmsWebhook(
  req: Request,
  res: Response
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const providedSecret = typeof body.secret === "string" ? body.secret : "";

  if (!verifyWebhookSecret(providedSecret)) {
    console.warn("[TextLinkSMS] Rejected: invalid webhook secret");
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }

  const fromPhone = String(body.phone_number ?? "").trim();
  const messageBody = String(body.text ?? "").trim();
  const incomingId =
    typeof body.textlink_id === "string" && body.textlink_id
      ? body.textlink_id
      : typeof body.id === "string" && body.id
        ? body.id
        : "";
  const messageSid = incomingId || generateMessageSid();

  if (!fromPhone || !messageBody) {
    res.status(200).json({ ok: true });
    return;
  }

  const channel = "sms" as const;

  const account = await getDefaultAccount();
  if (!account) {
    console.warn("[TextLinkSMS] No default account configured");
    res.status(200).json({ ok: true });
    return;
  }

  const gatedConversation = await getOrCreateConversationForInboundWebhook({
    account,
    customerPhone: fromPhone,
    channel,
  });

  if (!gatedConversation.allowed) {
    console.warn(
      `[TextLinkSMS] Billing gate blocked from ${fromPhone} for account ${account.id}: ${gatedConversation.gate.reason}`
    );
    try {
      await sendSms(fromPhone, gatedConversation.gate.customerMessage);
    } catch (smsErr) {
      console.error("[TextLinkSMS] Failed to send billing gate reply:", smsErr);
    }
    res.status(200).json({ ok: true });
    return;
  }

  const conversation = gatedConversation.conversation;

  await createMessage({
    conversationId: conversation.id,
    role: "user",
    body: messageBody,
  });
  await updateConversation(conversation.id, { lastUserMessageAt: new Date() });
  await cancelFollowUpJobsForConversation(conversation.id);

  const allMessages = await getMessagesByConversation(conversation.id);
  const priorMessages = allMessages.slice(-21, -1);
  const historyForAI = priorMessages.map(m => ({
    role: m.role as "user" | "assistant",
    content: m.body,
  }));
  const previousExtractedFields = coerceExtractedFields(
    conversation.currentState
  );
  const previousRiskFlags = parseRiskFlags(conversation.riskFlags);

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
        console.error("[TextLinkSMS] AI parse error:", err.message, err.raw);
      } else {
        console.error("[TextLinkSMS] Unexpected AI error:", err);
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

  const prevStatus = conversation.status;
  const nextStatus = transition(prevStatus, intakeResult);

  if (
    intakeResult.nextAction === "confirm_details" ||
    nextStatus === "qualified"
  ) {
    replyText = appendBookingLink(replyText, account);
  }

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

    createCalendarEvent(account, intakeResult.extractedFields).catch(err =>
      console.error("[TextLinkSMS] Calendar event creation error:", err)
    );

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

  if (!intakeResult.shouldSendReply) {
    console.info(
      `[TextLinkSMS] Skipping reply — shouldSendReply=false for conversation ${conversation.id}`
    );
  } else {
    try {
      await sendSms(fromPhone, replyText);
    } catch (smsErr) {
      console.error("[TextLinkSMS] Failed to send reply:", smsErr);
    }
  }

  res.status(200).json({ ok: true });
}
