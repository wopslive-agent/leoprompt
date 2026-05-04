import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Account } from "../../drizzle/schema";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const mockDb = vi.hoisted(() => ({
  account: undefined as Account | undefined,
  deletedUserId: undefined as number | undefined,
}));

const createMockAccount = (overrides: Partial<Account> = {}): Account => ({
  id: 1,
  userId: 1,
  businessName: "My Business",
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
  onboardingComplete: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

vi.mock("../db", () => ({
  getAccountByUserId: vi.fn(async (userId: number) =>
    mockDb.account?.userId === userId ? mockDb.account : undefined
  ),
  createAccount: vi.fn(async (data: Partial<Account>) => {
    mockDb.account = createMockAccount(data);
    return mockDb.account;
  }),
  updateAccount: vi.fn(async (accountId: number, data: Partial<Account>) => {
    if (mockDb.account?.id !== accountId) return;
    mockDb.account = {
      ...mockDb.account,
      ...data,
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    };
  }),
  deleteUserAccount: vi.fn(async (userId: number) => {
    mockDb.deletedUserId = userId;
    mockDb.account = undefined;
  }),
  createAiPersonaVersion: vi.fn(async () => ({
    id: 1,
    accountId: 1,
    userId: 1,
    aiPersona: "Version",
    label: "Test",
    createdAt: new Date(),
  })),
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

describe("accounts router", () => {
  let ctx: TrpcContext;

  beforeEach(() => {
    ctx = createAuthContext();
    mockDb.account = createMockAccount();
    mockDb.deletedUserId = undefined;
  });

  it("should get or create account for user", async () => {
    mockDb.account = undefined;
    const caller = appRouter.createCaller(ctx);
    const account = await caller.accounts.getOrCreate();

    expect(account).toBeDefined();
    expect(account.userId).toBe(ctx.user!.id);
    expect(account.businessName).toBeDefined();
  });

  it("should complete onboarding with all required fields", async () => {
    const caller = appRouter.createCaller(ctx);

    const result = await caller.accounts.completeOnboarding({
      businessName: "Elegant Events",
      servicesOffered: "Event planning, coordination",
      pricing: "Starting at $500",
      availability: "Monday-Friday 9AM-6PM",
      aiPersona: "Be professional and friendly",
    });

    expect(result).toBeDefined();
    expect(result.businessName).toBe("Elegant Events");
    expect(result.servicesOffered).toBe("Event planning, coordination");
  });

  it("should update account settings", async () => {
    const caller = appRouter.createCaller(ctx);

    const updated = await caller.accounts.update({
      businessName: "Updated Business",
      servicesOffered: "New services",
      pricing: "Updated pricing",
      availability: "Updated availability",
      aiPersona: "Updated persona",
      notificationEmail: "new@example.com",
    });

    expect(updated).toBeDefined();
    expect(updated.businessName).toBe("Updated Business");
  });

  it("should delete the current account and clear the session cookie", async () => {
    const clearCookie = vi.fn();
    ctx.res = {
      clearCookie,
    } as TrpcContext["res"];
    const caller = appRouter.createCaller(ctx);

    const result = await caller.accounts.deleteCurrent();

    expect(result).toEqual({ success: true });
    expect(mockDb.deletedUserId).toBe(ctx.user!.id);
    expect(clearCookie).toHaveBeenCalledWith(
      "app_session_id",
      expect.objectContaining({ maxAge: -1 })
    );
  });
});
