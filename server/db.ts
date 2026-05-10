import { eq, and, asc, desc, sql, inArray, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  accounts,
  conversations,
  messages,
  leadsLog,
  notifications,
  aiPersonaVersions,
  conversationFeedback,
  conversationTags,
  smsMessageBatches,
  followUpJobs,
  Account,
  Conversation,
  Message,
  LeadLog,
  Notification,
  User,
  AiPersonaVersion,
  ConversationFeedback,
  ConversationTag,
  SmsMessageBatch,
  FollowUpJob,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import {
  evaluateInboundWebhookBillingGate,
  type InboundWebhookBillingGateDecision,
} from "./_core/billing";

let _db: ReturnType<typeof drizzle> | null = null;

const memory = {
  nextUserId: 1,
  nextAccountId: 1,
  nextConversationId: 1,
  nextMessageId: 1,
  nextLeadId: 1,
  nextNotificationId: 1,
  nextAiPersonaVersionId: 1,
  nextConversationFeedbackId: 1,
  nextConversationTagId: 1,
  nextSmsMessageBatchId: 1,
  nextFollowUpJobId: 1,
  users: [] as User[],
  accounts: [] as Account[],
  conversations: [] as Conversation[],
  messages: [] as Message[],
  leadsLog: [] as LeadLog[],
  notifications: [] as Notification[],
  aiPersonaVersions: [] as AiPersonaVersion[],
  conversationFeedback: [] as ConversationFeedback[],
  conversationTags: [] as ConversationTag[],
  smsMessageBatches: [] as SmsMessageBatch[],
  followUpJobs: [] as FollowUpJob[],
};

function seedDemoAccount(account: Account) {
  if (
    memory.conversations.some(
      conversation => conversation.accountId === account.id
    )
  ) {
    return;
  }

  const createdAt = new Date("2026-05-01T14:30:00.000Z");
  const conversationSamples: Conversation[] = [
    {
      id: memory.nextConversationId++,
      accountId: account.id,
      customerPhone: "4165550148",
      channel: "sms" as const,
      status: "qualified",
      currentState: {
        bookingType: "Wedding coordination",
        eventDate: "2026-06-20",
        guestCount: "120",
        fullAddress: "18 King St W, Toronto",
      },
      riskFlags: "[]",
      handoffReason: null,
      rejectionReason: null,
      shouldHandoff: false,
      shouldReject: false,
      lastUserMessageAt: new Date("2026-05-02T12:15:00.000Z"),
      lastAgentMessageAt: new Date("2026-05-02T12:16:00.000Z"),
      createdAt,
      updatedAt: new Date("2026-05-02T12:16:00.000Z"),
    },
    {
      id: memory.nextConversationId++,
      accountId: account.id,
      customerPhone: "6475550199",
      channel: "sms" as const,
      status: "handoff_needed",
      currentState: {
        bookingType: "Corporate event",
        eventDate: "2026-05-18",
        guestCount: "75",
      },
      riskFlags: JSON.stringify(["short_notice", "custom_contract_request"]),
      handoffReason: "Customer needs custom terms before booking.",
      rejectionReason: null,
      shouldHandoff: true,
      shouldReject: false,
      lastUserMessageAt: new Date("2026-05-02T11:25:00.000Z"),
      lastAgentMessageAt: new Date("2026-05-02T11:26:00.000Z"),
      createdAt: new Date("2026-05-02T11:20:00.000Z"),
      updatedAt: new Date("2026-05-02T11:26:00.000Z"),
    },
    {
      id: memory.nextConversationId++,
      accountId: account.id,
      customerPhone: "9055550121",
      channel: "sms" as const,
      status: "collecting_details",
      currentState: {
        bookingType: "Birthday party",
        missingFields: ["date", "guestCount"],
      },
      riskFlags: "[]",
      handoffReason: null,
      rejectionReason: null,
      shouldHandoff: false,
      shouldReject: false,
      lastUserMessageAt: new Date("2026-05-02T09:10:00.000Z"),
      lastAgentMessageAt: new Date("2026-05-02T09:11:00.000Z"),
      createdAt: new Date("2026-05-02T09:08:00.000Z"),
      updatedAt: new Date("2026-05-02T09:11:00.000Z"),
    },
  ];

  memory.conversations.push(...conversationSamples);

  const firstConversation = conversationSamples[0];
  memory.messages.push(
    {
      id: memory.nextMessageId++,
      conversationId: firstConversation.id,
      role: "user",
      body: "Hi, do you coordinate weddings in June?",
      rawModelOutput: null,
      schemaValid: true,
      parseError: false,
      nextAction: null,
      missingFields: null,
      extractedFields: null,
      confidenceOverall: null,
      notesForManager: null,
      ownerAlertSent: false,
      createdAt: new Date("2026-05-02T12:15:00.000Z"),
    },
    {
      id: memory.nextMessageId++,
      conversationId: firstConversation.id,
      role: "assistant",
      body: "Absolutely. I can help collect the details. What date, guest count, and venue should I note?",
      rawModelOutput: null,
      schemaValid: true,
      parseError: false,
      nextAction: "collect_details",
      missingFields: JSON.stringify(["eventDate", "guestCount", "venue"]),
      extractedFields: null,
      confidenceOverall: "0.92" as any,
      notesForManager: null,
      ownerAlertSent: false,
      createdAt: new Date("2026-05-02T12:16:00.000Z"),
    }
  );

  memory.leadsLog.push(
    {
      id: memory.nextLeadId++,
      accountId: account.id,
      conversationId: firstConversation.id,
      inboundMessageId: null,
      timestamp: new Date("2026-05-02T12:16:00.000Z"),
      status: "qualified",
      nextAction: "owner_follow_up",
      handoffReason: null,
      rejectionReason: null,
      missingFields: null,
      riskFlags: "[]",
      schemaValid: true,
      parseError: false,
      ownerAlertSent: true,
      managerAssigned: null,
      managerTakeoverAt: null,
      replyText: "Thanks. I passed this to the team for follow-up.",
      notesForManager: "Wedding coordination lead, strong intent.",
      extractedFields: {
        bookingType: "Wedding coordination",
        duration: "Full day",
        guestCount: "120",
        fullAddress: "18 King St W, Toronto",
      },
      createdAt: new Date("2026-05-02T12:16:00.000Z"),
    },
    {
      id: memory.nextLeadId++,
      accountId: account.id,
      conversationId: conversationSamples[1].id,
      inboundMessageId: null,
      timestamp: new Date("2026-05-02T11:26:00.000Z"),
      status: "handoff_needed",
      nextAction: "manager_review",
      handoffReason: "Custom contract request",
      rejectionReason: null,
      missingFields: JSON.stringify(["budget"]),
      riskFlags: JSON.stringify(["short_notice"]),
      schemaValid: true,
      parseError: false,
      ownerAlertSent: true,
      managerAssigned: null,
      managerTakeoverAt: null,
      replyText: "A manager will review this and follow up.",
      notesForManager: "Corporate event wants non-standard terms.",
      extractedFields: {
        bookingType: "Corporate event",
        duration: "4 hours",
        guestCount: "75",
        fullAddress: "100 Queens Quay E, Toronto",
      },
      createdAt: new Date("2026-05-02T11:26:00.000Z"),
    }
  );

  memory.notifications.push({
    id: memory.nextNotificationId++,
    accountId: account.id,
    userId: account.userId,
    type: "new_lead",
    title: "New qualified lead",
    content: "Wedding coordination inquiry is ready for follow-up.",
    leadId: 1,
    conversationId: firstConversation.id,
    readAt: null,
    createdAt: new Date("2026-05-02T12:16:00.000Z"),
  });
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    const existing = memory.users.find(
      existingUser => existingUser.openId === user.openId
    );
    if (existing) {
      Object.assign(existing, user, { updatedAt: new Date() });
      return;
    }
    memory.users.push({
      id: memory.nextUserId++,
      openId: user.openId,
      name: user.name ?? null,
      email: user.email ?? null,
      passwordHash: user.passwordHash ?? null,
      loginMethod: user.loginMethod ?? null,
      role: user.role ?? "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: user.lastSignedIn ?? new Date(),
    });
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    return memory.users.find(user => user.openId === openId);
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return memory.users.find(user => user.id === id);
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) return memory.users.find(user => user.email === email);
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createUserWithPassword(data: {
  email: string;
  name: string;
  passwordHash: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    memory.users.push({
      id: memory.nextUserId++,
      openId: `email_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      email: data.email,
      name: data.name,
      passwordHash: data.passwordHash,
      loginMethod: "email",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    });
    return;
  }
  await db.insert(users).values([
    {
      openId: `email_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      email: data.email,
      name: data.name,
      passwordHash: data.passwordHash,
      loginMethod: "email",
      lastSignedIn: new Date(),
    },
  ]);
}

// Account queries
export async function getAccountById(
  accountId: number
): Promise<Account | undefined> {
  const db = await getDb();
  if (!db) {
    return memory.accounts.find(account => account.id === accountId);
  }
  const result = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAccountByTwilioPhone(
  phone: string
): Promise<Account | undefined> {
  const db = await getDb();
  if (!db) {
    return memory.accounts.find(account => account.twilioPhoneNumber === phone);
  }
  const result = await db
    .select()
    .from(accounts)
    .where(eq(accounts.twilioPhoneNumber, phone))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getDefaultAccount(): Promise<Account | null> {
  const db = await getDb();
  if (!db) {
    const matches = memory.accounts.filter(
      account => account.twilioPhoneNumber !== null && account.twilioPhoneNumber !== undefined
    );
    if (matches.length === 0) return null;
    if (matches.length > 1) {
      console.warn(
        `[db] getDefaultAccount: ${matches.length} accounts with twilioPhoneNumber set; using first (id=${matches[0].id})`
      );
    }
    return matches[0];
  }
  const result = await db
    .select()
    .from(accounts)
    .where(sql`${accounts.twilioPhoneNumber} IS NOT NULL`)
    .limit(2);
  if (result.length === 0) return null;
  if (result.length > 1) {
    console.warn(
      `[db] getDefaultAccount: multiple accounts with twilioPhoneNumber set; using first (id=${result[0].id})`
    );
  }
  return result[0];
}

export async function getAccountByStripeCustomerId(
  stripeCustomerId: string
): Promise<Account | undefined> {
  const db = await getDb();
  if (!db) {
    return memory.accounts.find(
      account => account.stripeCustomerId === stripeCustomerId
    );
  }
  const result = await db
    .select()
    .from(accounts)
    .where(eq(accounts.stripeCustomerId, stripeCustomerId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAccountByStripeSubscriptionId(
  stripeSubscriptionId: string
): Promise<Account | undefined> {
  const db = await getDb();
  if (!db) {
    return memory.accounts.find(
      account => account.stripeSubscriptionId === stripeSubscriptionId
    );
  }
  const result = await db
    .select()
    .from(accounts)
    .where(eq(accounts.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAccountByUserId(
  userId: number
): Promise<Account | undefined> {
  const db = await getDb();
  if (!db) return memory.accounts.find(account => account.userId === userId);
  const result = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createAccount(data: {
  userId: number;
  businessName: string;
  servicesOffered?: string;
  pricing?: string;
  availability?: string;
  aiPersona?: string;
  notificationEmail?: string;
  plan?: "trial" | "starter" | "pro" | "agency";
}): Promise<Account> {
  const db = await getDb();
  if (!db) {
    const account: Account = {
      id: memory.nextAccountId++,
      userId: data.userId,
      businessName:
        data.businessName === "My Business"
          ? "Leoprompt Demo Events"
          : data.businessName,
      servicesOffered:
        data.servicesOffered ?? "Event planning, coordination, private parties",
      pricing:
        data.pricing ?? "Packages start at $500. Custom quotes available.",
      availability:
        data.availability ?? "Monday-Friday 9AM-6PM, weekend events available",
      aiPersona:
        data.aiPersona ??
        "Friendly, polished, concise. Ask for date, guest count, service type, and address.",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      plan: data.plan || "trial",
      active: true,
      notificationEmail: data.notificationEmail ?? null,
      twilioPhoneNumber: null,
      calendlyUrl: null,
      whatsappPhoneNumber: null,
      followUpEnabled: false,
      googleCalendarId: null,
      googleCalendarAccessToken: null,
      googleCalendarRefreshToken: null,
      onboardingComplete: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memory.accounts.push(account);
    seedDemoAccount(account);
    return account;
  }
  const insertData = { ...data, plan: data.plan || "trial" } as any;
  const result = await db.insert(accounts).values([insertData]);
  const accountId = (result as any).insertId;
  const created = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  return created[0];
}

export async function updateAccount(
  accountId: number,
  data: Partial<Account>
): Promise<void> {
  const db = await getDb();
  if (!db) {
    const index = memory.accounts.findIndex(
      account => account.id === accountId
    );
    if (index !== -1) {
      memory.accounts[index] = {
        ...memory.accounts[index],
        ...data,
        updatedAt: new Date(),
      };
      seedDemoAccount(memory.accounts[index]);
    }
    return;
  }
  await db.update(accounts).set(data).where(eq(accounts.id, accountId));
}

export async function deleteUserAccount(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) {
    const accountIds = memory.accounts
      .filter(account => account.userId === userId)
      .map(account => account.id);
    const conversationIds = memory.conversations
      .filter(conversation => accountIds.includes(conversation.accountId))
      .map(conversation => conversation.id);

    memory.messages = memory.messages.filter(
      message => !conversationIds.includes(message.conversationId)
    );
    memory.leadsLog = memory.leadsLog.filter(
      lead => !accountIds.includes(lead.accountId)
    );
    memory.conversations = memory.conversations.filter(
      conversation => !accountIds.includes(conversation.accountId)
    );
    memory.notifications = memory.notifications.filter(
      notification => notification.userId !== userId
    );
    memory.aiPersonaVersions = memory.aiPersonaVersions.filter(
      version => !accountIds.includes(version.accountId)
    );
    memory.conversationFeedback = memory.conversationFeedback.filter(
      feedback => !accountIds.includes(feedback.accountId)
    );
    memory.conversationTags = memory.conversationTags.filter(
      tag => !accountIds.includes(tag.accountId)
    );
    memory.smsMessageBatches = memory.smsMessageBatches.filter(
      batch => !accountIds.includes(batch.accountId)
    );
    memory.followUpJobs = memory.followUpJobs.filter(
      job => !accountIds.includes(job.accountId)
    );
    memory.accounts = memory.accounts.filter(
      account => account.userId !== userId
    );
    memory.users = memory.users.filter(user => user.id !== userId);
    return;
  }

  await db.transaction(async tx => {
    const ownedAccounts = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.userId, userId));
    const accountIds = ownedAccounts.map(account => account.id);

    if (accountIds.length > 0) {
      const ownedConversations = await tx
        .select({ id: conversations.id })
        .from(conversations)
        .where(inArray(conversations.accountId, accountIds));
      const conversationIds = ownedConversations.map(
        conversation => conversation.id
      );

      if (conversationIds.length > 0) {
        await tx
          .delete(messages)
          .where(inArray(messages.conversationId, conversationIds));
      }

      await tx.delete(leadsLog).where(inArray(leadsLog.accountId, accountIds));
      await tx
        .delete(aiPersonaVersions)
        .where(inArray(aiPersonaVersions.accountId, accountIds));
      await tx
        .delete(conversationFeedback)
        .where(inArray(conversationFeedback.accountId, accountIds));
      await tx
        .delete(conversationTags)
        .where(inArray(conversationTags.accountId, accountIds));
      await tx
        .delete(smsMessageBatches)
        .where(inArray(smsMessageBatches.accountId, accountIds));
      await tx
        .delete(conversations)
        .where(inArray(conversations.accountId, accountIds));
      await tx.delete(accounts).where(inArray(accounts.id, accountIds));
    }

    await tx.delete(notifications).where(eq(notifications.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));
  });
}

// Conversation queries
export async function getOrCreateConversation(
  accountId: number,
  customerPhone: string,
  channel: "sms" | "whatsapp" = "sms"
): Promise<Conversation> {
  const db = await getDb();
  if (!db) {
    const existing = memory.conversations.find(
      conversation =>
        conversation.accountId === accountId &&
        conversation.customerPhone === customerPhone
    );
    if (existing) return existing;

    const conversation: Conversation = {
      id: memory.nextConversationId++,
      accountId,
      customerPhone,
      channel,
      status: "new",
      currentState: null,
      riskFlags: null,
      handoffReason: null,
      rejectionReason: null,
      shouldHandoff: false,
      shouldReject: false,
      lastUserMessageAt: new Date(),
      lastAgentMessageAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memory.conversations.push(conversation);
    return conversation;
  }

  const existing = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.accountId, accountId),
        eq(conversations.customerPhone, customerPhone)
      )
    )
    .limit(1);

  if (existing.length > 0) return existing[0];

  const result = await db
    .insert(conversations)
    .values({ accountId, customerPhone, channel });
  const convId = (result as any).insertId;
  const created = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, convId))
    .limit(1);
  return created[0];
}

export type InboundConversationGateResult =
  | {
      allowed: true;
      conversation: Conversation;
      gate: Extract<InboundWebhookBillingGateDecision, { allowed: true }>;
    }
  | {
      allowed: false;
      gate: Extract<InboundWebhookBillingGateDecision, { allowed: false }>;
    };

export async function getOrCreateConversationForInboundWebhook({
  account,
  customerPhone,
  channel = "sms",
  now = new Date(),
}: {
  account: Pick<Account, "id" | "active" | "plan">;
  customerPhone: string;
  channel?: "sms" | "whatsapp";
  now?: Date;
}): Promise<InboundConversationGateResult> {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const db = await getDb();
  if (!db) {
    const existing = memory.conversations.find(
      conversation =>
        conversation.accountId === account.id &&
        conversation.customerPhone === customerPhone
    );
    const currentMonthlyConversations = memory.conversations.filter(
      conversation =>
        conversation.accountId === account.id &&
        conversation.createdAt >= monthStart
    ).length;
    const gate = evaluateInboundWebhookBillingGate({
      account,
      currentMonthlyConversations,
      isExistingConversation: Boolean(existing),
    });

    if (!gate.allowed) return { allowed: false, gate };
    if (existing) return { allowed: true, conversation: existing, gate };

    const conversation: Conversation = {
      id: memory.nextConversationId++,
      accountId: account.id,
      customerPhone,
      channel,
      status: "new",
      currentState: null,
      riskFlags: null,
      handoffReason: null,
      rejectionReason: null,
      shouldHandoff: false,
      shouldReject: false,
      lastUserMessageAt: new Date(),
      lastAgentMessageAt: null,
      createdAt: now,
      updatedAt: now,
    };
    memory.conversations.push(conversation);
    return { allowed: true, conversation, gate };
  }

  return db.transaction(async tx => {
    await tx.execute(
      sql`SELECT id FROM ${accounts} WHERE ${accounts.id} = ${account.id} FOR UPDATE`
    );
    const lockedAccount = await tx
      .select({ active: accounts.active, plan: accounts.plan })
      .from(accounts)
      .where(eq(accounts.id, account.id))
      .limit(1);
    const accountForGate = lockedAccount[0] ?? account;

    const existing = await tx
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.accountId, account.id),
          eq(conversations.customerPhone, customerPhone)
        )
      )
      .limit(1);

    const countResult = await tx
      .select({ count: sql<number>`COUNT(*)` })
      .from(conversations)
      .where(
        and(
          eq(conversations.accountId, account.id),
          gte(conversations.createdAt, monthStart)
        )
      );

    const gate = evaluateInboundWebhookBillingGate({
      account: accountForGate,
      currentMonthlyConversations: Number(countResult[0]?.count ?? 0),
      isExistingConversation: existing.length > 0,
    });

    if (!gate.allowed) return { allowed: false, gate };
    if (existing.length > 0) {
      return { allowed: true, conversation: existing[0], gate };
    }

    const result = await tx
      .insert(conversations)
      .values({ accountId: account.id, customerPhone, channel });
    const convId = (result as any).insertId;
    const created = await tx
      .select()
      .from(conversations)
      .where(eq(conversations.id, convId))
      .limit(1);

    return { allowed: true, conversation: created[0], gate };
  });
}

export async function updateConversation(
  conversationId: number,
  data: Partial<Conversation>
): Promise<void> {
  const db = await getDb();
  if (!db) {
    const index = memory.conversations.findIndex(
      conversation => conversation.id === conversationId
    );
    if (index !== -1) {
      memory.conversations[index] = {
        ...memory.conversations[index],
        ...data,
        updatedAt: new Date(),
      };
    }
    return;
  }
  await db
    .update(conversations)
    .set(data)
    .where(eq(conversations.id, conversationId));
}

export async function getConversationsByAccount(
  accountId: number,
  limit: number = 50
): Promise<Conversation[]> {
  const db = await getDb();
  if (!db) {
    return memory.conversations
      .filter(conversation => conversation.accountId === accountId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit);
  }
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.accountId, accountId))
    .orderBy(desc(conversations.updatedAt))
    .limit(limit);
}

export async function getConversationById(
  conversationId: number
): Promise<Conversation | undefined> {
  const db = await getDb();
  if (!db) {
    return memory.conversations.find(
      conversation => conversation.id === conversationId
    );
  }
  const result = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getConversationByAccountAndPhone(
  accountId: number,
  customerPhone: string
): Promise<Conversation | undefined> {
  const db = await getDb();
  if (!db) {
    return memory.conversations.find(
      conversation =>
        conversation.accountId === accountId &&
        conversation.customerPhone === customerPhone
    );
  }
  const result = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.accountId, accountId),
        eq(conversations.customerPhone, customerPhone)
      )
    )
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getMonthlyConversationCountByAccount(
  accountId: number,
  now: Date = new Date()
): Promise<number> {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const db = await getDb();
  if (!db) {
    return memory.conversations.filter(
      conversation =>
        conversation.accountId === accountId &&
        conversation.createdAt >= monthStart
    ).length;
  }
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(conversations)
    .where(
      and(
        eq(conversations.accountId, accountId),
        gte(conversations.createdAt, monthStart)
      )
    );
  return Number(result[0]?.count ?? 0);
}

// Message queries
export async function createMessage(data: {
  conversationId: number;
  role: "user" | "assistant";
  body: string;
  rawModelOutput?: any;
  schemaValid?: boolean;
  parseError?: boolean;
  nextAction?: string;
  missingFields?: string;
  extractedFields?: any;
  confidenceOverall?: number;
  notesForManager?: string;
}): Promise<Message> {
  const db = await getDb();
  if (!db) {
    const message: Message = {
      id: memory.nextMessageId++,
      conversationId: data.conversationId,
      role: data.role,
      body: data.body,
      rawModelOutput: data.rawModelOutput ?? null,
      schemaValid: data.schemaValid ?? true,
      parseError: data.parseError ?? false,
      nextAction: data.nextAction ?? null,
      missingFields: data.missingFields ?? null,
      extractedFields: data.extractedFields ?? null,
      confidenceOverall: data.confidenceOverall
        ? (String(data.confidenceOverall) as any)
        : null,
      notesForManager: data.notesForManager ?? null,
      ownerAlertSent: false,
      createdAt: new Date(),
    };
    memory.messages.push(message);
    return message;
  }
  const insertData = {
    ...data,
    confidenceOverall: data.confidenceOverall
      ? String(data.confidenceOverall)
      : null,
  };
  const result = await db.insert(messages).values([insertData as any]);
  const msgId = (result as any).insertId;
  const created = await db
    .select()
    .from(messages)
    .where(eq(messages.id, msgId))
    .limit(1);
  return created[0];
}

export async function getMessagesByConversation(
  conversationId: number
): Promise<Message[]> {
  const db = await getDb();
  if (!db) {
    return memory.messages
      .filter(message => message.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);
}

// Leads log queries
export async function createLeadLog(data: {
  accountId: number;
  conversationId?: number;
  inboundMessageId?: string;
  status: string;
  nextAction?: string;
  handoffReason?: string;
  rejectionReason?: string;
  missingFields?: string;
  riskFlags?: string;
  schemaValid?: boolean;
  parseError?: boolean;
  ownerAlertSent?: boolean;
  notesForManager?: string;
  replyText?: string;
  extractedFields?: any;
}): Promise<LeadLog> {
  const db = await getDb();
  if (!db) {
    const lead: LeadLog = {
      id: memory.nextLeadId++,
      accountId: data.accountId,
      conversationId: data.conversationId ?? null,
      inboundMessageId: data.inboundMessageId ?? null,
      timestamp: new Date(),
      status: data.status,
      nextAction: data.nextAction ?? null,
      handoffReason: data.handoffReason ?? null,
      rejectionReason: data.rejectionReason ?? null,
      missingFields: data.missingFields ?? null,
      riskFlags: data.riskFlags ?? null,
      schemaValid: data.schemaValid ?? true,
      parseError: data.parseError ?? false,
      ownerAlertSent: data.ownerAlertSent ?? false,
      managerAssigned: null,
      managerTakeoverAt: null,
      replyText: data.replyText ?? null,
      notesForManager: data.notesForManager ?? null,
      extractedFields: data.extractedFields ?? null,
      createdAt: new Date(),
    };
    memory.leadsLog.push(lead);
    return lead;
  }
  const result = await db.insert(leadsLog).values(data);
  const leadId = (result as any).insertId;
  const created = await db
    .select()
    .from(leadsLog)
    .where(eq(leadsLog.id, leadId))
    .limit(1);
  return created[0];
}

export async function getLeadsByAccount(
  accountId: number,
  limit: number = 100
): Promise<LeadLog[]> {
  const db = await getDb();
  if (!db) {
    return memory.leadsLog
      .filter(lead => lead.accountId === accountId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }
  return db
    .select()
    .from(leadsLog)
    .where(eq(leadsLog.accountId, accountId))
    .orderBy(desc(leadsLog.timestamp))
    .limit(limit);
}

// Notification queries
export async function createNotification(data: {
  accountId: number;
  userId: number;
  type: "new_lead" | "booking_confirmed" | "system";
  title: string;
  content: string;
  leadId?: number;
  conversationId?: number;
}): Promise<Notification> {
  const db = await getDb();
  if (!db) {
    const notification: Notification = {
      id: memory.nextNotificationId++,
      accountId: data.accountId,
      userId: data.userId,
      type: data.type,
      title: data.title,
      content: data.content,
      leadId: data.leadId ?? null,
      conversationId: data.conversationId ?? null,
      readAt: null,
      createdAt: new Date(),
    };
    memory.notifications.push(notification);
    return notification;
  }
  const result = await db.insert(notifications).values(data);
  const notifId = (result as any).insertId;
  const created = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, notifId))
    .limit(1);
  return created[0];
}

export async function getNotificationsByUser(
  userId: number,
  limit: number = 50
): Promise<Notification[]> {
  const db = await getDb();
  if (!db) {
    return memory.notifications
      .filter(notification => notification.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markNotificationAsRead(
  notificationId: number,
  userId: number
): Promise<void> {
  const db = await getDb();
  if (!db) {
    const notification = memory.notifications.find(
      notification =>
        notification.id === notificationId && notification.userId === userId
    );
    if (notification) notification.readAt = new Date();
    return;
  }
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId)
      )
    );
}

export async function markAllNotificationsAsRead(
  userId: number
): Promise<void> {
  const db = await getDb();
  if (!db) {
    memory.notifications.forEach(notification => {
      if (notification.userId === userId && !notification.readAt) {
        notification.readAt = new Date();
      }
    });
    return;
  }
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        sql`${notifications.readAt} IS NULL`
      )
    );
}

export async function getUnreadNotificationCount(
  userId: number
): Promise<number> {
  const db = await getDb();
  if (!db) {
    return memory.notifications.filter(
      notification => notification.userId === userId && !notification.readAt
    ).length;
  }
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        sql`${notifications.readAt} IS NULL`
      )
    );
  return result[0]?.count ?? 0;
}

// AI training and customization queries
export async function createAiPersonaVersion(data: {
  accountId: number;
  userId: number;
  aiPersona: string;
  label?: string;
}): Promise<AiPersonaVersion> {
  const db = await getDb();
  if (!db) {
    const version: AiPersonaVersion = {
      id: memory.nextAiPersonaVersionId++,
      accountId: data.accountId,
      userId: data.userId,
      aiPersona: data.aiPersona,
      label: data.label ?? null,
      createdAt: new Date(),
    };
    memory.aiPersonaVersions.push(version);
    return version;
  }

  const result = await db.insert(aiPersonaVersions).values(data);
  const versionId = (result as any).insertId;
  const created = await db
    .select()
    .from(aiPersonaVersions)
    .where(eq(aiPersonaVersions.id, versionId))
    .limit(1);
  return created[0];
}

export async function getAiPersonaVersionsByAccount(
  accountId: number,
  limit: number = 20
): Promise<AiPersonaVersion[]> {
  const db = await getDb();
  if (!db) {
    return memory.aiPersonaVersions
      .filter(version => version.accountId === accountId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  return db
    .select()
    .from(aiPersonaVersions)
    .where(eq(aiPersonaVersions.accountId, accountId))
    .orderBy(desc(aiPersonaVersions.createdAt))
    .limit(limit);
}

export async function getAiPersonaVersionById(
  versionId: number
): Promise<AiPersonaVersion | undefined> {
  const db = await getDb();
  if (!db) {
    return memory.aiPersonaVersions.find(version => version.id === versionId);
  }

  const result = await db
    .select()
    .from(aiPersonaVersions)
    .where(eq(aiPersonaVersions.id, versionId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getConversationFeedbackByConversation(
  conversationId: number
): Promise<ConversationFeedback | undefined> {
  const db = await getDb();
  if (!db) {
    return memory.conversationFeedback.find(
      feedback => feedback.conversationId === conversationId
    );
  }

  const result = await db
    .select()
    .from(conversationFeedback)
    .where(eq(conversationFeedback.conversationId, conversationId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertConversationFeedback(data: {
  accountId: number;
  conversationId: number;
  rating: "works_well" | "needs_improvement" | "bug";
  comment?: string;
}): Promise<ConversationFeedback> {
  const db = await getDb();
  if (!db) {
    const existing = memory.conversationFeedback.find(
      feedback =>
        feedback.accountId === data.accountId &&
        feedback.conversationId === data.conversationId
    );
    if (existing) {
      existing.rating = data.rating;
      existing.comment = data.comment ?? null;
      existing.updatedAt = new Date();
      return existing;
    }

    const feedback: ConversationFeedback = {
      id: memory.nextConversationFeedbackId++,
      accountId: data.accountId,
      conversationId: data.conversationId,
      rating: data.rating,
      comment: data.comment ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memory.conversationFeedback.push(feedback);
    return feedback;
  }

  const existing = await db
    .select()
    .from(conversationFeedback)
    .where(
      and(
        eq(conversationFeedback.accountId, data.accountId),
        eq(conversationFeedback.conversationId, data.conversationId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(conversationFeedback)
      .set({ rating: data.rating, comment: data.comment ?? null })
      .where(eq(conversationFeedback.id, existing[0].id));
    const updated = await db
      .select()
      .from(conversationFeedback)
      .where(eq(conversationFeedback.id, existing[0].id))
      .limit(1);
    return updated[0];
  }

  const result = await db.insert(conversationFeedback).values(data);
  const feedbackId = (result as any).insertId;
  const created = await db
    .select()
    .from(conversationFeedback)
    .where(eq(conversationFeedback.id, feedbackId))
    .limit(1);
  return created[0];
}

export async function getConversationTagsByConversation(
  conversationId: number
): Promise<ConversationTag[]> {
  const db = await getDb();
  if (!db) {
    return memory.conversationTags
      .filter(tag => tag.conversationId === conversationId)
      .sort((a, b) => a.tag.localeCompare(b.tag));
  }

  return db
    .select()
    .from(conversationTags)
    .where(eq(conversationTags.conversationId, conversationId))
    .orderBy(conversationTags.tag);
}

export async function setConversationTags(data: {
  accountId: number;
  conversationId: number;
  tags: string[];
}): Promise<ConversationTag[]> {
  const normalizedTags = Array.from(
    new Set(
      data.tags
        .map(tag => tag.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 12)
    )
  );

  const db = await getDb();
  if (!db) {
    memory.conversationTags = memory.conversationTags.filter(
      tag =>
        !(
          tag.accountId === data.accountId &&
          tag.conversationId === data.conversationId
        )
    );
    const created = normalizedTags.map(tag => ({
      id: memory.nextConversationTagId++,
      accountId: data.accountId,
      conversationId: data.conversationId,
      tag,
      createdAt: new Date(),
    }));
    memory.conversationTags.push(...created);
    return created;
  }

  await db
    .delete(conversationTags)
    .where(
      and(
        eq(conversationTags.accountId, data.accountId),
        eq(conversationTags.conversationId, data.conversationId)
      )
    );

  if (normalizedTags.length > 0) {
    await db.insert(conversationTags).values(
      normalizedTags.map(tag => ({
        accountId: data.accountId,
        conversationId: data.conversationId,
        tag,
      }))
    );
  }

  return getConversationTagsByConversation(data.conversationId);
}

export async function getTrainingAnalytics(accountId: number) {
  const db = await getDb();
  if (!db) {
    const accountConversationIds = memory.conversations
      .filter(conversation => conversation.accountId === accountId)
      .map(conversation => conversation.id);
    const feedback = memory.conversationFeedback.filter(
      item => item.accountId === accountId
    );
    const tags = memory.conversationTags.filter(
      item => item.accountId === accountId
    );
    const accountMessages = memory.messages.filter(message =>
      accountConversationIds.includes(message.conversationId)
    );

    return summarizeTrainingAnalytics(feedback, tags, accountMessages);
  }

  const accountConversations = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.accountId, accountId));
  const conversationIds = accountConversations.map(
    conversation => conversation.id
  );
  const feedback = await db
    .select()
    .from(conversationFeedback)
    .where(eq(conversationFeedback.accountId, accountId));
  const tags = await db
    .select()
    .from(conversationTags)
    .where(eq(conversationTags.accountId, accountId));
  const accountMessages =
    conversationIds.length > 0
      ? await db
          .select()
          .from(messages)
          .where(inArray(messages.conversationId, conversationIds))
      : [];

  return summarizeTrainingAnalytics(feedback, tags, accountMessages);
}

function summarizeTrainingAnalytics(
  feedback: ConversationFeedback[],
  tags: ConversationTag[],
  accountMessages: Message[]
) {
  const ratingCounts = {
    works_well: 0,
    needs_improvement: 0,
    bug: 0,
  };
  feedback.forEach(item => {
    ratingCounts[item.rating] += 1;
  });

  const tagCounts = tags.reduce<Record<string, number>>((counts, item) => {
    counts[item.tag] = (counts[item.tag] ?? 0) + 1;
    return counts;
  }, {});

  const assistantMessages = accountMessages.filter(
    message => message.role === "assistant"
  );
  const parseErrors = assistantMessages.filter(
    message => message.parseError
  ).length;
  const lowConfidence = assistantMessages.filter(message => {
    if (!message.confidenceOverall) return false;
    return Number(message.confidenceOverall) < 0.6;
  }).length;

  return {
    totalFeedback: feedback.length,
    ratingCounts,
    topTags: Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }))
      .slice(0, 8),
    assistantMessages: assistantMessages.length,
    parseErrors,
    lowConfidence,
  };
}

// SMS batching queries
export async function createSmsMessageBatch(data: {
  accountId: number;
  customerPhone: string;
  twilioPhoneNumber: string;
  messageSid?: string;
  body: string;
}): Promise<SmsMessageBatch> {
  const db = await getDb();
  if (!db) {
    const batch: SmsMessageBatch = {
      id: memory.nextSmsMessageBatchId++,
      accountId: data.accountId,
      customerPhone: data.customerPhone,
      twilioPhoneNumber: data.twilioPhoneNumber,
      messageSid: data.messageSid ?? null,
      body: data.body,
      status: "pending",
      createdAt: new Date(),
    };
    memory.smsMessageBatches.push(batch);
    return batch;
  }

  const result = await db.insert(smsMessageBatches).values(data);
  const batchId = (result as any).insertId;
  const created = await db
    .select()
    .from(smsMessageBatches)
    .where(eq(smsMessageBatches.id, batchId))
    .limit(1);
  return created[0];
}

export async function getPendingSmsMessageBatches(data: {
  accountId: number;
  customerPhone: string;
}): Promise<SmsMessageBatch[]> {
  const db = await getDb();
  if (!db) {
    return memory.smsMessageBatches
      .filter(
        batch =>
          batch.accountId === data.accountId &&
          batch.customerPhone === data.customerPhone &&
          batch.status === "pending"
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  return db
    .select()
    .from(smsMessageBatches)
    .where(
      and(
        eq(smsMessageBatches.accountId, data.accountId),
        eq(smsMessageBatches.customerPhone, data.customerPhone),
        eq(smsMessageBatches.status, "pending")
      )
    )
    .orderBy(asc(smsMessageBatches.createdAt));
}

export async function updateSmsMessageBatchStatus(
  ids: number[],
  status: "pending" | "processing" | "processed"
): Promise<void> {
  if (ids.length === 0) return;

  const db = await getDb();
  if (!db) {
    memory.smsMessageBatches.forEach(batch => {
      if (ids.includes(batch.id)) batch.status = status;
    });
    return;
  }

  await db
    .update(smsMessageBatches)
    .set({ status })
    .where(inArray(smsMessageBatches.id, ids));
}

// WhatsApp account routing
export async function getAccountByWhatsAppPhone(
  phone: string
): Promise<Account | undefined> {
  const db = await getDb();
  if (!db) {
    return memory.accounts.find(
      account => account.whatsappPhoneNumber === phone
    );
  }
  const result = await db
    .select()
    .from(accounts)
    .where(eq(accounts.whatsappPhoneNumber, phone))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Follow-up job queries
export async function createFollowUpJob(data: {
  accountId: number;
  conversationId: number;
  customerPhone: string;
  channel: "sms" | "whatsapp";
  jobType:
    | "no_reply_2h"
    | "no_reply_24h"
    | "appointment_reminder_24h"
    | "appointment_reminder_1h";
  scheduledAt: Date;
}): Promise<FollowUpJob> {
  const db = await getDb();
  if (!db) {
    const job: FollowUpJob = {
      id: memory.nextFollowUpJobId++,
      accountId: data.accountId,
      conversationId: data.conversationId,
      customerPhone: data.customerPhone,
      channel: data.channel,
      jobType: data.jobType,
      scheduledAt: data.scheduledAt,
      status: "pending",
      sentAt: null,
      createdAt: new Date(),
    };
    memory.followUpJobs.push(job);
    return job;
  }
  const result = await db.insert(followUpJobs).values(data);
  const jobId = (result as any).insertId;
  const created = await db
    .select()
    .from(followUpJobs)
    .where(eq(followUpJobs.id, jobId))
    .limit(1);
  return created[0];
}

export async function getDueFollowUpJobs(
  now: Date = new Date()
): Promise<FollowUpJob[]> {
  const db = await getDb();
  if (!db) {
    return memory.followUpJobs.filter(
      job => job.status === "pending" && job.scheduledAt <= now
    );
  }
  return db
    .select()
    .from(followUpJobs)
    .where(
      and(
        eq(followUpJobs.status, "pending"),
        lte(followUpJobs.scheduledAt, now)
      )
    );
}

export async function updateFollowUpJobStatus(
  jobId: number,
  status: "sent" | "cancelled",
  sentAt?: Date
): Promise<void> {
  const db = await getDb();
  if (!db) {
    const job = memory.followUpJobs.find(j => j.id === jobId);
    if (job) {
      job.status = status;
      if (sentAt) job.sentAt = sentAt;
    }
    return;
  }
  await db
    .update(followUpJobs)
    .set({ status, ...(sentAt ? { sentAt } : {}) })
    .where(eq(followUpJobs.id, jobId));
}

export async function cancelFollowUpJobsForConversation(
  conversationId: number
): Promise<void> {
  const db = await getDb();
  if (!db) {
    memory.followUpJobs.forEach(job => {
      if (job.conversationId === conversationId && job.status === "pending") {
        job.status = "cancelled";
      }
    });
    return;
  }
  await db
    .update(followUpJobs)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(followUpJobs.conversationId, conversationId),
        eq(followUpJobs.status, "pending")
      )
    );
}

export async function getFollowUpJobsByAccount(
  accountId: number,
  limit: number = 50
): Promise<FollowUpJob[]> {
  const db = await getDb();
  if (!db) {
    return memory.followUpJobs
      .filter(job => job.accountId === accountId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
  return db
    .select()
    .from(followUpJobs)
    .where(eq(followUpJobs.accountId, accountId))
    .orderBy(desc(followUpJobs.createdAt))
    .limit(limit);
}
