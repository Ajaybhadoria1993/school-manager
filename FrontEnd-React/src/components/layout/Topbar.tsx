import { useState } from "react";
import { CalendarDays, ChevronDown, LogOut, Menu } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useDismiss } from "../../hooks/useDismiss";
import { cn, initials } from "../../utils/helpers";
import { ROLE_LABELS } from "./nav-config";
import { NotificationsBell } from "./NotificationsBell";

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  if (!user) return null;
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2.5 rounded-full border border-border bg-surface py-1 pl-1 pr-3 transition-all hover:border-[#cbd5e1] hover:shadow-card"
      >
        <span className="relative flex size-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
          {initials(user.name)}
          <span
            className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface bg-success"
            aria-hidden
          />
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-32 truncate text-sm font-semibold text-foreground">
            {user.name}
          </span>
          <span className="block text-[11px] text-foreground-muted">
            {ROLE_LABELS[user.role]}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 text-foreground-muted transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && (
        <div className="pop-in absolute right-0 top-12 z-30 w-64 origin-top-right rounded-2xl border border-border bg-surface p-2 shadow-float">
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-bold text-foreground">
              {user.name}
            </p>
            <p className="truncate text-xs text-foreground-muted">
              {user.email ?? user.username}
            </p>
          </div>
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => logout()}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-danger transition-colors hover:bg-danger-soft"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** The bar above every page: menu button (phones), the school and page name, today's date, notifications, and the account menu. */
export function Topbar({
  onMenuClick,
  title,
}: {
  onMenuClick: () => void;
  title: string;
}) {
  const { user, tenant } = useAuth();
  const [today] = useState(() => new Date());
  if (!user) return null;

  const context =
    user.role === "super_admin"
      ? "Platform console"
      : (tenant?.name ?? "Your school");

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onMenuClick}
          aria-label="Open menu"
          className="rounded-lg p-2 text-foreground-muted hover:bg-surface-muted lg:hidden"
        >
          <Menu className="size-5" />
        </button>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
            {context}
          </p>
          <p className="truncate text-lg font-bold tracking-tight text-foreground">
            {title}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <span className="hidden items-center gap-2 rounded-full bg-primary-soft px-3.5 py-1.5 text-xs font-semibold text-primary-deep md:inline-flex">
          <CalendarDays className="size-3.5" aria-hidden />
          {new Intl.DateTimeFormat("en-IN", {
            weekday: "short",
            day: "2-digit",
            month: "short",
            year: "numeric",
          }).format(today)}
        </span>
        <NotificationsBell />
        <UserMenu />
      </div>
    </header>
  );
}
