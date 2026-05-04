import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck, Inbox, MessageSquare } from "lucide-react";
import { useLocation } from "wouter";

export function NotificationBell() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const notificationsQuery = trpc.notifications.list.useQuery(
    { limit: 10 },
    { refetchInterval: 30_000 }
  );
  const unreadCountQuery = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const refreshNotifications = async () => {
    await Promise.all([
      utils.notifications.list.invalidate(),
      utils.notifications.unreadCount.invalidate(),
    ]);
  };

  const markAsRead = trpc.notifications.markAsRead.useMutation({
    onSuccess: refreshNotifications,
  });
  const markAllAsRead = trpc.notifications.markAllAsRead.useMutation({
    onSuccess: refreshNotifications,
  });

  const notifications = notificationsQuery.data ?? [];
  const unreadCount = unreadCountQuery.data?.count ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-4 text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div>
            <p className="text-sm font-medium leading-none">Notifications</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
            </p>
          </div>
          {unreadCount > 0 ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => markAllAsRead.mutate()}
              disabled={markAllAsRead.isPending}
              aria-label="Mark all notifications as read"
            >
              <CheckCheck className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        <div className="max-h-96 overflow-y-auto py-1">
          {notificationsQuery.isLoading ? (
            <div className="space-y-2 px-3 py-3">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-3 w-48 animate-pulse rounded bg-muted" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">No notifications</p>
              <p className="text-xs text-muted-foreground">
                New leads and handoffs will show up here.
              </p>
            </div>
          ) : (
            notifications.map(notification => {
              const isUnread = !notification.readAt;
              return (
                <button
                  key={notification.id}
                  className={cn(
                    "flex w-full gap-3 px-3 py-3 text-left transition-colors hover:bg-accent focus:bg-accent focus:outline-none",
                    isUnread && "bg-accent/40"
                  )}
                  onClick={() => {
                    if (isUnread) {
                      markAsRead.mutate({ notificationId: notification.id });
                    }
                    if (notification.conversationId) {
                      setLocation(
                        `/conversations/${notification.conversationId}`
                      );
                    }
                  }}
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {notification.title}
                      </span>
                      {isUnread ? (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      ) : null}
                    </span>
                    <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {notification.content}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(notification.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
