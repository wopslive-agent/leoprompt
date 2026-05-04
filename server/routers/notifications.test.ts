import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Account, Notification } from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import { notificationsRouter } from "./notifications";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const mockDb = vi.hoisted(() => ({
  account: undefined as Account | undefined,
  notifications: [] as Notification[],
  markedNotification: undefined as
    | { notificationId: number; userId: number }
    | undefined,
  markedAllUserId: undefined as number | undefined,
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

const createMockNotification = (
  overrides: Partial<Notification> = {}
): Notification => ({
  id: 1,
  accountId: 10,
  userId: 1,
  type: "new_lead",
  title: "New lead",
  content: "A qualified lead is ready.",
  leadId: null,
  conversationId: 100,
  readAt: null,
  createdAt: new Date("2026-01-02T00:00:00.000Z"),
  ...overrides,
});

vi.mock("../db", () => ({
  getAccountByUserId: vi.fn(async (userId: number) =>
    mockDb.account?.userId === userId ? mockDb.account : undefined
  ),
  getNotificationsByUser: vi.fn(async (userId: number, limit: number) =>
    mockDb.notifications
      .filter(notification => notification.userId === userId)
      .slice(0, limit)
  ),
  markNotificationAsRead: vi.fn(
    async (notificationId: number, userId: number) => {
      mockDb.markedNotification = { notificationId, userId };
      const notification = mockDb.notifications.find(
        item => item.id === notificationId && item.userId === userId
      );
      if (notification) notification.readAt = new Date();
    }
  ),
  markAllNotificationsAsRead: vi.fn(async (userId: number) => {
    mockDb.markedAllUserId = userId;
    mockDb.notifications.forEach(notification => {
      if (notification.userId === userId) notification.readAt = new Date();
    });
  }),
  getUnreadNotificationCount: vi.fn(
    async (userId: number) =>
      mockDb.notifications.filter(
        notification => notification.userId === userId && !notification.readAt
      ).length
  ),
  createNotification: vi.fn(async (data: Partial<Notification>) => {
    const notification = createMockNotification({
      ...data,
      id: mockDb.notifications.length + 1,
      createdAt: new Date("2026-01-03T00:00:00.000Z"),
      readAt: null,
    });
    mockDb.notifications.unshift(notification);
    return notification;
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

describe("notifications router", () => {
  let ctx: TrpcContext;

  beforeEach(() => {
    ctx = createAuthContext();
    mockDb.account = createMockAccount();
    mockDb.notifications = [
      createMockNotification({ id: 1 }),
      createMockNotification({ id: 2, title: "Read", readAt: new Date() }),
      createMockNotification({ id: 3, userId: 2, title: "Other user" }),
    ];
    mockDb.markedNotification = undefined;
    mockDb.markedAllUserId = undefined;
  });

  it("lists notifications for the current user", async () => {
    const caller = notificationsRouter.createCaller(ctx);

    const result = await caller.list({ limit: 10 });

    expect(result).toHaveLength(2);
    expect(
      result.every(notification => notification.userId === ctx.user!.id)
    ).toBe(true);
  });

  it("returns unread count for the current user", async () => {
    const caller = notificationsRouter.createCaller(ctx);

    await expect(caller.unreadCount()).resolves.toEqual({ count: 1 });
  });

  it("marks a notification as read for the current user", async () => {
    const caller = notificationsRouter.createCaller(ctx);

    await expect(caller.markAsRead({ notificationId: 1 })).resolves.toEqual({
      success: true,
    });

    expect(mockDb.markedNotification).toEqual({
      notificationId: 1,
      userId: ctx.user!.id,
    });
    await expect(caller.unreadCount()).resolves.toEqual({ count: 0 });
  });

  it("marks all notifications as read for the current user", async () => {
    const caller = notificationsRouter.createCaller(ctx);

    await expect(caller.markAllAsRead()).resolves.toEqual({ success: true });

    expect(mockDb.markedAllUserId).toBe(ctx.user!.id);
    await expect(caller.unreadCount()).resolves.toEqual({ count: 0 });
  });

  it("creates a notification under the current user's account", async () => {
    const caller = notificationsRouter.createCaller(ctx);

    const result = await caller.create({
      type: "system",
      title: "System update",
      content: "Webhook connected.",
      conversationId: 99,
    });

    expect(result).toMatchObject({
      accountId: mockDb.account!.id,
      userId: ctx.user!.id,
      type: "system",
      title: "System update",
      content: "Webhook connected.",
      conversationId: 99,
    });
  });

  it("rejects create when the user has no account", async () => {
    mockDb.account = undefined;
    const caller = notificationsRouter.createCaller(ctx);

    await expect(
      caller.create({
        type: "system",
        title: "System update",
        content: "Webhook connected.",
      })
    ).rejects.toThrow("Account not found");
  });
});
