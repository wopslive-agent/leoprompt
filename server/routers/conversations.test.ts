import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Account, Conversation, Message } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { conversationsRouter } from "./conversations";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const mockDb = vi.hoisted(() => ({
  account: undefined as Account | undefined,
  conversations: [] as Conversation[],
  messages: [] as Message[],
  updatedConversation: undefined as
    | { conversationId: number; data: Partial<Conversation> }
    | undefined,
}));

const createMockAccount = (overrides: Partial<Account> = {}): Account => ({
  id: 10,
  userId: 1,
  businessName: "Demo Business",
  servicesOffered: null,
  pricing: null,
  availability: null,
  aiPersona: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  plan: "trial",
  active: true,
  notificationEmail: null,
  twilioPhoneNumber: null,
  onboardingComplete: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

const createMockConversation = (
  overrides: Partial<Conversation> = {}
): Conversation => ({
  id: 100,
  accountId: 10,
  customerPhone: "4165550148",
  status: "collecting_details",
  currentState: null,
  riskFlags: null,
  handoffReason: null,
  rejectionReason: null,
  shouldHandoff: false,
  shouldReject: false,
  lastUserMessageAt: null,
  lastAgentMessageAt: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  ...overrides,
});

const createMockMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 1,
  conversationId: 100,
  role: "user",
  body: "Hello",
  rawModelOutput: null,
  schemaValid: true,
  parseError: false,
  nextAction: null,
  missingFields: null,
  extractedFields: null,
  confidenceOverall: null,
  notesForManager: null,
  ownerAlertSent: false,
  createdAt: new Date("2026-01-02T00:00:00.000Z"),
  ...overrides,
});

vi.mock("../db", () => ({
  getAccountByUserId: vi.fn(async (userId: number) =>
    mockDb.account?.userId === userId ? mockDb.account : undefined
  ),
  getConversationsByAccount: vi.fn(async (accountId: number, limit: number) =>
    mockDb.conversations
      .filter(conversation => conversation.accountId === accountId)
      .slice(0, limit)
  ),
  getConversationById: vi.fn(async (conversationId: number) =>
    mockDb.conversations.find(
      conversation => conversation.id === conversationId
    )
  ),
  updateConversation: vi.fn(
    async (conversationId: number, data: Partial<Conversation>) => {
      mockDb.updatedConversation = { conversationId, data };
      const index = mockDb.conversations.findIndex(
        conversation => conversation.id === conversationId
      );
      if (index !== -1) {
        mockDb.conversations[index] = {
          ...mockDb.conversations[index],
          ...data,
        };
      }
    }
  ),
  getMessagesByConversation: vi.fn(async (conversationId: number) =>
    mockDb.messages.filter(message => message.conversationId === conversationId)
  ),
  createMessage: vi.fn(async (data: Partial<Message>) => {
    const message = createMockMessage({
      ...data,
      id: mockDb.messages.length + 1,
      createdAt: new Date("2026-01-03T00:00:00.000Z"),
    });
    mockDb.messages.push(message);
    return message;
  }),
}));

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "email",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("conversations router", () => {
  let ctx: TrpcContext;

  beforeEach(() => {
    ctx = createAuthContext();
    mockDb.account = createMockAccount();
    mockDb.conversations = [
      createMockConversation({ id: 100, status: "collecting_details" }),
      createMockConversation({
        id: 101,
        status: "qualified",
        customerPhone: "6475550199",
      }),
      createMockConversation({
        id: 102,
        accountId: 99,
        status: "qualified",
      }),
    ];
    mockDb.messages = [
      createMockMessage({ id: 1, conversationId: 100, body: "Hi" }),
      createMockMessage({
        id: 2,
        conversationId: 100,
        role: "assistant",
        body: "How can I help?",
      }),
    ];
    mockDb.updatedConversation = undefined;
  });

  it("lists conversations for the current account", async () => {
    const caller = conversationsRouter.createCaller(ctx);

    const result = await caller.list({ limit: 10 });

    expect(result).toHaveLength(2);
    expect(result.every(conversation => conversation.accountId === 10)).toBe(
      true
    );
  });

  it("filters conversations by status", async () => {
    const caller = conversationsRouter.createCaller(ctx);

    const result = await caller.list({ limit: 10, status: "qualified" });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(101);
  });

  it("returns a conversation detail with messages when owned by the account", async () => {
    const caller = conversationsRouter.createCaller(ctx);

    const result = await caller.getDetail({ conversationId: 100 });

    expect(result.conversation.id).toBe(100);
    expect(result.messages).toHaveLength(2);
  });

  it("rejects detail access for another account's conversation", async () => {
    const caller = conversationsRouter.createCaller(ctx);

    await expect(caller.getDetail({ conversationId: 102 })).rejects.toThrow(
      "Unauthorized"
    );
  });

  it("updates status only after account ownership is verified", async () => {
    const caller = conversationsRouter.createCaller(ctx);

    await expect(
      caller.updateStatus({ conversationId: 100, status: "qualified" })
    ).resolves.toEqual({ success: true });

    expect(mockDb.updatedConversation).toEqual({
      conversationId: 100,
      data: { status: "qualified" },
    });
  });

  it("adds manager notes as assistant messages", async () => {
    const caller = conversationsRouter.createCaller(ctx);

    await expect(
      caller.addNote({ conversationId: 100, note: "Call before booking." })
    ).resolves.toEqual({ success: true });

    expect(mockDb.messages.at(-1)).toMatchObject({
      conversationId: 100,
      role: "assistant",
      body: "[Manager Note: Call before booking.]",
    });
  });
});
