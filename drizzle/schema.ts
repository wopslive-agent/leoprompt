import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, boolean, decimal, uniqueIndex, foreignKey, index } from "drizzle-orm/mysql-core";
import { relations } from "drizzle-orm";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Operator accounts table — one per business using the platform
 */
export const accounts = mysqlTable("accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  businessName: varchar("businessName", { length: 255 }).notNull(),
  servicesOffered: text("servicesOffered"), // JSON array of services
  pricing: text("pricing"), // JSON object with service pricing
  availability: text("availability"), // JSON object with hours and days
  aiPersona: text("aiPersona"), // Custom AI instructions for this operator
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  plan: mysqlEnum("plan", ["trial", "starter", "pro", "agency"]).default("trial").notNull(),
  active: boolean("active").default(true).notNull(),
  notificationEmail: varchar("notificationEmail", { length: 320 }),
  twilioPhoneNumber: varchar("twilioPhoneNumber", { length: 20 }),
  calendlyUrl: varchar("calendlyUrl", { length: 500 }),
  whatsappPhoneNumber: varchar("whatsappPhoneNumber", { length: 20 }),
  followUpEnabled: boolean("followUpEnabled").default(false).notNull(),
  googleCalendarId: varchar("googleCalendarId", { length: 255 }),
  googleCalendarAccessToken: text("googleCalendarAccessToken"),
  googleCalendarRefreshToken: text("googleCalendarRefreshToken"),
  onboardingComplete: boolean("onboardingComplete").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("userId_idx").on(table.userId),
}));

export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;

/**
 * Conversations table — one per customer phone per account
 */
export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  customerPhone: varchar("customerPhone", { length: 20 }).notNull(),
  channel: mysqlEnum("channel", ["sms", "whatsapp"]).default("sms").notNull(),
  status: mysqlEnum("status", [
    "new",
    "faq_only",
    "collecting_details",
    "qualified",
    "handoff_needed",
    "human_review",
    "awaiting_manager",
    "rejected",
    "closed",
  ]).default("new").notNull(),
  currentState: json("currentState"), // Extracted fields snapshot
  riskFlags: text("riskFlags"), // JSON array of risk flags
  handoffReason: varchar("handoffReason", { length: 255 }),
  rejectionReason: varchar("rejectionReason", { length: 255 }),
  shouldHandoff: boolean("shouldHandoff").default(false).notNull(),
  shouldReject: boolean("shouldReject").default(false).notNull(),
  lastUserMessageAt: timestamp("lastUserMessageAt"),
  lastAgentMessageAt: timestamp("lastAgentMessageAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  accountPhoneIdx: index("accountPhone_idx").on(table.accountId, table.customerPhone),
}));

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

/**
 * Messages table — all inbound and outbound messages per conversation
 */
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  body: text("body").notNull(),
  rawModelOutput: json("rawModelOutput"), // Full Claude response
  schemaValid: boolean("schemaValid").default(true).notNull(),
  parseError: boolean("parseError").default(false).notNull(),
  nextAction: varchar("nextAction", { length: 255 }),
  missingFields: text("missingFields"), // JSON array
  extractedFields: json("extractedFields"), // Parsed booking details
  confidenceOverall: decimal("confidenceOverall", { precision: 3, scale: 2 }),
  notesForManager: text("notesForManager"),
  ownerAlertSent: boolean("ownerAlertSent").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  conversationIdIdx: index("conversationId_idx").on(table.conversationId),
}));

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

/**
 * Leads log table — summary of qualified leads and bookings
 */
export const leadsLog = mysqlTable("leadsLog", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  conversationId: int("conversationId"),
  inboundMessageId: varchar("inboundMessageId", { length: 255 }),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  nextAction: varchar("nextAction", { length: 255 }),
  handoffReason: varchar("handoffReason", { length: 255 }),
  rejectionReason: varchar("rejectionReason", { length: 255 }),
  missingFields: text("missingFields"), // JSON array
  riskFlags: text("riskFlags"), // JSON array
  schemaValid: boolean("schemaValid").default(true).notNull(),
  parseError: boolean("parseError").default(false).notNull(),
  ownerAlertSent: boolean("ownerAlertSent").default(false).notNull(),
  managerAssigned: varchar("managerAssigned", { length: 255 }),
  managerTakeoverAt: timestamp("managerTakeoverAt"),
  replyText: text("replyText"),
  notesForManager: text("notesForManager"),
  extractedFields: json("extractedFields"), // Booking details
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  accountIdIdx: index("leadsLog_accountId_idx").on(table.accountId),
}));

export type LeadLog = typeof leadsLog.$inferSelect;
export type InsertLeadLog = typeof leadsLog.$inferInsert;

/**
 * Notifications table — in-app notifications for operators
 */
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["new_lead", "booking_confirmed", "system"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  leadId: int("leadId"),
  conversationId: int("conversationId"),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  accountIdIdx: index("notifications_accountId_idx").on(table.accountId),
  userIdIdx: index("notifications_userId_idx").on(table.userId),
}));

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * Versioned AI persona snapshots for rollback and prompt iteration.
 */
export const aiPersonaVersions = mysqlTable("aiPersonaVersions", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  userId: int("userId").notNull(),
  aiPersona: text("aiPersona").notNull(),
  label: varchar("label", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  accountIdIdx: index("aiPersonaVersions_accountId_idx").on(table.accountId),
}));

export type AiPersonaVersion = typeof aiPersonaVersions.$inferSelect;
export type InsertAiPersonaVersion = typeof aiPersonaVersions.$inferInsert;

/**
 * Operator feedback for model training and response quality reporting.
 */
export const conversationFeedback = mysqlTable("conversationFeedback", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  conversationId: int("conversationId").notNull(),
  rating: mysqlEnum("rating", ["works_well", "needs_improvement", "bug"]).notNull(),
  comment: text("comment"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  conversationIdIdx: index("conversationFeedback_conversationId_idx").on(table.conversationId),
}));

export type ConversationFeedback = typeof conversationFeedback.$inferSelect;
export type InsertConversationFeedback = typeof conversationFeedback.$inferInsert;

/**
 * Lightweight labels for conversations used in review and training workflows.
 */
export const conversationTags = mysqlTable("conversationTags", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  conversationId: int("conversationId").notNull(),
  tag: varchar("tag", { length: 80 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  conversationIdIdx: index("conversationTags_conversationId_idx").on(table.conversationId),
}));

export type ConversationTag = typeof conversationTags.$inferSelect;
export type InsertConversationTag = typeof conversationTags.$inferInsert;

/**
 * Temporary holding table for rapid-fire inbound SMS batching.
 */
export const smsMessageBatches = mysqlTable("smsMessageBatches", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  customerPhone: varchar("customerPhone", { length: 20 }).notNull(),
  twilioPhoneNumber: varchar("twilioPhoneNumber", { length: 20 }).notNull(),
  messageSid: varchar("messageSid", { length: 255 }),
  body: text("body").notNull(),
  status: mysqlEnum("status", ["pending", "processing", "processed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  accountPhoneStatusIdx: index("smsMessageBatches_accountPhoneStatus_idx").on(
    table.accountId,
    table.customerPhone,
    table.status
  ),
}));

export type SmsMessageBatch = typeof smsMessageBatches.$inferSelect;
export type InsertSmsMessageBatch = typeof smsMessageBatches.$inferInsert;

/**
 * Scheduled follow-up and reminder jobs per conversation.
 */
export const followUpJobs = mysqlTable("followUpJobs", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("accountId").notNull(),
  conversationId: int("conversationId").notNull(),
  customerPhone: varchar("customerPhone", { length: 20 }).notNull(),
  channel: mysqlEnum("channel", ["sms", "whatsapp"]).default("sms").notNull(),
  jobType: mysqlEnum("jobType", [
    "no_reply_2h",
    "no_reply_24h",
    "appointment_reminder_24h",
    "appointment_reminder_1h",
  ]).notNull(),
  scheduledAt: timestamp("scheduledAt").notNull(),
  status: mysqlEnum("status", ["pending", "sent", "cancelled"]).default("pending").notNull(),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  accountIdIdx: index("followUpJobs_accountId_idx").on(table.accountId),
  scheduledStatusIdx: index("followUpJobs_scheduledAt_status_idx").on(table.scheduledAt, table.status),
}));

export type FollowUpJob = typeof followUpJobs.$inferSelect;
export type InsertFollowUpJob = typeof followUpJobs.$inferInsert;

/**
 * Relations for type safety
 */
export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
  conversations: many(conversations),
  notifications: many(notifications),
  leadsLog: many(leadsLog),
  aiPersonaVersions: many(aiPersonaVersions),
  conversationFeedback: many(conversationFeedback),
  conversationTags: many(conversationTags),
  smsMessageBatches: many(smsMessageBatches),
  followUpJobs: many(followUpJobs),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  account: one(accounts, { fields: [conversations.accountId], references: [accounts.id] }),
  messages: many(messages),
  leadsLog: many(leadsLog),
  notifications: many(notifications),
  feedback: many(conversationFeedback),
  tags: many(conversationTags),
  followUpJobs: many(followUpJobs),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, { fields: [messages.conversationId], references: [conversations.id] }),
}));

export const leadsLogRelations = relations(leadsLog, ({ one }) => ({
  account: one(accounts, { fields: [leadsLog.accountId], references: [accounts.id] }),
  conversation: one(conversations, { fields: [leadsLog.conversationId], references: [conversations.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  account: one(accounts, { fields: [notifications.accountId], references: [accounts.id] }),
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  conversation: one(conversations, { fields: [notifications.conversationId], references: [conversations.id] }),
}));

export const aiPersonaVersionsRelations = relations(aiPersonaVersions, ({ one }) => ({
  account: one(accounts, { fields: [aiPersonaVersions.accountId], references: [accounts.id] }),
  user: one(users, { fields: [aiPersonaVersions.userId], references: [users.id] }),
}));

export const conversationFeedbackRelations = relations(conversationFeedback, ({ one }) => ({
  account: one(accounts, { fields: [conversationFeedback.accountId], references: [accounts.id] }),
  conversation: one(conversations, { fields: [conversationFeedback.conversationId], references: [conversations.id] }),
}));

export const conversationTagsRelations = relations(conversationTags, ({ one }) => ({
  account: one(accounts, { fields: [conversationTags.accountId], references: [accounts.id] }),
  conversation: one(conversations, { fields: [conversationTags.conversationId], references: [conversations.id] }),
}));

export const smsMessageBatchesRelations = relations(smsMessageBatches, ({ one }) => ({
  account: one(accounts, { fields: [smsMessageBatches.accountId], references: [accounts.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  notifications: many(notifications),
  aiPersonaVersions: many(aiPersonaVersions),
}));

export const followUpJobsRelations = relations(followUpJobs, ({ one }) => ({
  account: one(accounts, { fields: [followUpJobs.accountId], references: [accounts.id] }),
  conversation: one(conversations, { fields: [followUpJobs.conversationId], references: [conversations.id] }),
}));
