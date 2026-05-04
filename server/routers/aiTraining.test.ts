import { describe, expect, it, beforeEach, vi } from "vitest";
import type {
  Account,
  AiPersonaVersion,
  Conversation,
  ConversationFeedback,
  ConversationTag,
  Message,
} from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { aiTrainingRouter } from "./aiTraining";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const mockDb = vi.hoisted(() => ({
  account: undefined as Account | undefined,
  versions: [] as AiPersonaVersion[],
  conversations: [] as Conversation[],
  messages: [] as Message[],
  feedback: undefined as ConversationFeedback | undefined,
  tags: [] as ConversationTag[],
  updatedAccount: undefined as Partial<Account> | undefined,
}));

const createAccount = (overrides: Partial<Account> = {}): Account => ({
  id: 10,
  userId: 1,
  businessName: "Demo Business",
  servicesOffered: null,
  pricing: null,
  availability: null,
  aiPersona: "Friendly and direct",
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  plan: "starter",
  active: true,
  notificationEmail: null,
  twilioPhoneNumber: null,
  onboardingComplete: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

const createConversation = (
  overrides: Partial<Conversation> = {}
): Conversation => ({
  id: 100,
  accountId: 10,
  customerPhone: "4165550148",
  status: "qualified",
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

vi.mock("../db", () => ({
  getAccountByUserId: vi.fn(async (userId: number) =>
    mockDb.account?.userId === userId ? mockDb.account : undefined
  ),
  getAiPersonaVersionsByAccount: vi.fn(async (accountId: number) =>
    mockDb.versions.filter(version => version.accountId === accountId)
  ),
  getAiPersonaVersionById: vi.fn(async (versionId: number) =>
    mockDb.versions.find(version => version.id === versionId)
  ),
  createAiPersonaVersion: vi.fn(async (data: Partial<AiPersonaVersion>) => {
    const version = {
      id: mockDb.versions.length + 1,
      accountId: data.accountId!,
      userId: data.userId!,
      aiPersona: data.aiPersona!,
      label: data.label ?? null,
      createdAt: new Date("2026-01-03T00:00:00.000Z"),
    };
    mockDb.versions.push(version);
    return version;
  }),
  updateAccount: vi.fn(async (_accountId: number, data: Partial<Account>) => {
    mockDb.updatedAccount = data;
    if (mockDb.account) mockDb.account = { ...mockDb.account, ...data };
  }),
  getConversationById: vi.fn(async (conversationId: number) =>
    mockDb.conversations.find(
      conversation => conversation.id === conversationId
    )
  ),
  getConversationFeedbackByConversation: vi.fn(async () => mockDb.feedback),
  getConversationTagsByConversation: vi.fn(async () => mockDb.tags),
  upsertConversationFeedback: vi.fn(
    async (data: Partial<ConversationFeedback>) => {
      mockDb.feedback = {
        id: 1,
        accountId: data.accountId!,
        conversationId: data.conversationId!,
        rating: data.rating!,
        comment: data.comment ?? null,
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
        updatedAt: new Date("2026-01-03T00:00:00.000Z"),
      };
      return mockDb.feedback;
    }
  ),
  setConversationTags: vi.fn(
    async (data: { accountId: number; conversationId: number; tags: string[] }) => {
      mockDb.tags = data.tags.map((tag, index) => ({
        id: index + 1,
        accountId: data.accountId,
        conversationId: data.conversationId,
        tag,
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
      }));
      return mockDb.tags;
    }
  ),
  getTrainingAnalytics: vi.fn(async () => ({
    totalFeedback: 1,
    ratingCounts: { works_well: 1, needs_improvement: 0, bug: 0 },
    topTags: [{ tag: "works_well", count: 1 }],
    assistantMessages: 2,
    parseErrors: 0,
    lowConfidence: 0,
  })),
  getMessagesByConversation: vi.fn(async () => mockDb.messages),
}));

function createContext(): TrpcContext {
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
    res: {} as TrpcContext["res"],
  };
}

describe("ai training router", () => {
  let ctx: TrpcContext;

  beforeEach(() => {
    ctx = createContext();
    mockDb.account = createAccount();
    mockDb.versions = [
      {
        id: 1,
        accountId: 10,
        userId: 1,
        aiPersona: "Older persona",
        label: "Settings update",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ];
    mockDb.conversations = [createConversation(), createConversation({ id: 200, accountId: 99 })];
    mockDb.feedback = undefined;
    mockDb.tags = [];
    mockDb.messages = [];
    mockDb.updatedAccount = undefined;
  });

  it("lists persona versions for the current account", async () => {
    const caller = aiTrainingRouter.createCaller(ctx);

    const versions = await caller.personaVersions({ limit: 10 });

    expect(versions).toHaveLength(1);
    expect(versions[0].aiPersona).toBe("Older persona");
  });

  it("restores an owned persona version", async () => {
    const caller = aiTrainingRouter.createCaller(ctx);

    const result = await caller.restorePersonaVersion({ versionId: 1 });

    expect(result).toEqual({ success: true, aiPersona: "Older persona" });
    expect(mockDb.updatedAccount).toEqual({ aiPersona: "Older persona" });
    expect(mockDb.versions.at(-1)?.label).toBe("Rollback to version 1");
  });

  it("rejects review access to another account's conversation", async () => {
    const caller = aiTrainingRouter.createCaller(ctx);

    await expect(
      caller.getConversationReview({ conversationId: 200 })
    ).rejects.toThrow("Conversation not found");
  });

  it("saves feedback and tags for an owned conversation", async () => {
    const caller = aiTrainingRouter.createCaller(ctx);

    const feedback = await caller.saveFeedback({
      conversationId: 100,
      rating: "needs_improvement",
      comment: "Asked for too much too soon.",
    });
    const tags = await caller.setTags({
      conversationId: 100,
      tags: ["needs_improvement", "pricing"],
    });

    expect(feedback.rating).toBe("needs_improvement");
    expect(tags.map(tag => tag.tag)).toEqual(["needs_improvement", "pricing"]);
  });

  it("returns analytics summary", async () => {
    const caller = aiTrainingRouter.createCaller(ctx);

    const analytics = await caller.analytics();

    expect(analytics.ratingCounts.works_well).toBe(1);
    expect(analytics.topTags[0]).toEqual({ tag: "works_well", count: 1 });
  });
});
