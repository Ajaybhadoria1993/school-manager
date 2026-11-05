import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, BookOpenText, CalendarClock, CalendarDays, ClipboardList, GraduationCap, UserCheck, type LucideIcon } from "lucide-react";
import { useDismiss } from "../../hooks/useDismiss";
import { useGetNotificationsQuery, useLazyGetOlderNotificationsQuery, useReadAllNotificationsMutation, useReadNotificationMutation } from "../../redux/api/notificationsApi";
import { cn } from "../../utils/helpers";
import { timeAgo } from "../../utils/notifications";
import type { NotificationItem, NotificationKind } from "../../types";
import { Skeleton } from "../ui/Skeleton";

const LOOK: Record<string, { icon: LucideIcon; tone: string }> = {
  leave: { icon: CalendarClock, tone: "bg-warning-soft text-warning" },
  attendance: { icon: UserCheck, tone: "bg-success-soft text-success" },
  diary: { icon: BookOpenText, tone: "bg-primary-soft text-primary" },
  test: { icon: ClipboardList, tone: "bg-info-soft text-info" },
  marks: { icon: ClipboardList, tone: "bg-info-soft text-info" },
  calendar: { icon: CalendarDays, tone: "bg-danger-soft text-danger" },
  class: { icon: GraduationCap, tone: "bg-primary-soft text-primary" },
  subject: { icon: GraduationCap, tone: "bg-primary-soft text-primary" },
};
const lookOf = (kind: NotificationKind) => LOOK[kind.split(".")[0]] ?? LOOK.class;

/**
 * The bell in the top bar (docs/notifications.md): the unread count on it; open, the newest first, each one click away from its page
 * (and read on that click); Mark all as read; Show older for what is further back. New ones come on the socket
 * (hooks/useLiveNotifications.ts), so it reads the server once.
 */
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const navigate = useNavigate();
  const res = useGetNotificationsQuery();
  const [read] = useReadNotificationMutation();
  const [readAll] = useReadAllNotificationsMutation();
  const [loadOlder, olderRes] = useLazyGetOlderNotificationsQuery();
  const [older, setOlder] = useState<NotificationItem[]>([]);
  const [olderHasMore, setOlderHasMore] = useState<boolean | null>(null);

  const page = res.data?.data;
  const unread = page?.unread ?? 0;
  const newest = page?.items ?? [];
  const items = [...newest, ...older.filter((o) => !newest.some((n) => n.id === o.id))];
  const hasMore = olderHasMore ?? page?.hasMore ?? false;

  async function showOlder() {
    const last = items[items.length - 1];
    if (!last) return;
    const got = (await loadOlder(last.id).unwrap()).data;
    setOlder((list) => [...list, ...got.items]);
    setOlderHasMore(got.hasMore);
  }

  function openOne(n: NotificationItem) {
    if (!n.readAt) {
      void read(n.id);
      setOlder((list) => list.map((o) => (o.id === n.id ? { ...o, readAt: new Date().toISOString() } : o)));
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  function markAll() {
    void readAll();
    setOlder((list) => list.map((o) => ({ ...o, readAt: o.readAt ?? new Date().toISOString() })));
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="bell-ring relative flex size-10 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span
            data-testid="unread-count"
            className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white ring-2 ring-surface"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="pop-in fixed inset-x-3 top-16 z-30 overflow-hidden rounded-2xl border border-border bg-surface shadow-float sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96 sm:origin-top-right"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-sm font-bold text-foreground">Notifications</p>
            {unread > 0 && (
              <button onClick={markAll} className="rounded-lg px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary-soft">
                Mark all as read
              </button>
            )}
          </div>
          {res.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-12 rounded-xl" />
              <Skeleton className="h-12 rounded-xl" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-surface-muted text-primary">
                <Bell className="size-5" aria-hidden />
              </span>
              <p className="text-sm font-semibold text-foreground">You are all caught up</p>
            </div>
          ) : (
            <div className="max-h-[min(70vh,30rem)] overflow-y-auto">
              <ul className="divide-y divide-border">
                {items.map((n) => {
                  const { icon: Icon, tone } = lookOf(n.kind);
                  return (
                    <li key={n.id}>
                      <button onClick={() => openOne(n)} className={cn("flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted", !n.readAt && "bg-primary-soft/40")}>
                        <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", tone)}>
                          <Icon className="size-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn("block text-sm text-foreground", n.readAt ? "font-medium" : "font-bold")}>{n.title}</span>
                          {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-foreground-muted">{n.body}</span>}
                          <span className="mt-1 block text-[11px] text-foreground-muted">{timeAgo(n.createdAt)}</span>
                        </span>
                        {!n.readAt && (
                          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary">
                            <span className="sr-only">Unread</span>
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {hasMore && (
                <div className="border-t border-border p-2">
                  <button
                    onClick={() => void showOlder()}
                    disabled={olderRes.isFetching}
                    className="w-full rounded-xl py-2 text-sm font-semibold text-primary transition-colors hover:bg-surface-muted disabled:opacity-60"
                  >
                    Show older
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
