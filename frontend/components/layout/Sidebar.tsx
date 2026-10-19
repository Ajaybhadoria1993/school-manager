"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, LogOut, X } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useSidebarCollapsed } from "@/lib/sidebar-state";
import { BrandMark } from "@/components/brand/BrandMark";
import { NAV_ITEMS, ROLE_LABELS, groupLabel } from "./nav-config";
import { usePending } from "./PendingProvider";

/**
 * The navy menu. On a laptop it can fold down to icons (remembered on this device); on a phone it slides in as a drawer.
 * Items are grouped under small headings, and planned modules carry a "Soon" tag.
 */
export function Sidebar({
  mobileOpen,
  onClose,
}: {
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const { user, tenant, logout } = useAuth();
  const { pending } = usePending();
  const [folded, setFolded] = useSidebarCollapsed();
  if (!user) return null;

  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));
  const isSuperAdmin = user.role === "super_admin";

  // Group in the order the items appear.
  const groups: { name: string; items: typeof items }[] = [];
  for (const item of items) {
    const name = groupLabel(item.group, user.role);
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.items.push(item);
    else groups.push({ name, items: [item] });
  }

  /** `compact` is the folded look; the phone drawer is never folded. */
  const render = (compact: boolean) => (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex items-center gap-2 pb-4 pt-5",
          compact ? "justify-center px-2" : "justify-between px-5",
        )}
      >
        <BrandMark
          href="/dashboard"
          onClick={onClose}
          size="sm"
          tone="inverse"
          compact={compact}
          tagline={
            isSuperAdmin ? "Platform console" : (tenant?.name ?? "School")
          }
        />
        <button
          onClick={onClose}
          aria-label="Close menu"
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
        >
          <X className="size-4" />
        </button>
      </div>

      <nav
        aria-label="Main"
        className="sidebar-scroll flex-1 overflow-y-auto px-3 pb-4"
      >
        {groups.map((group, gi) => (
          <div key={group.name} className={cn(gi > 0 && "mt-4")}>
            {compact ? (
              gi > 0 && (
                <div aria-hidden className="mx-3 mb-2 h-px bg-white/10" />
              )
            ) : (
              <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {group.name}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                const count = item.showPendingBadge ? pending : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                      title={compact ? item.label : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl py-1.5 text-sm font-semibold transition-all duration-200",
                        compact ? "justify-center px-1.5" : "px-2",
                        active
                          ? "bg-white/10 text-white"
                          : "text-slate-300 hover:bg-white/5 hover:text-white",
                      )}
                    >
                      {active && (
                        <span
                          aria-hidden
                          className="absolute inset-y-2 -left-3 w-1 rounded-r-full bg-sky"
                        />
                      )}
                      <span
                        className={cn(
                          "relative flex size-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
                          active
                            ? "bg-primary text-white shadow-[0_6px_14px_-4px_rgb(37_99_235/0.8)]"
                            : "bg-white/5 text-slate-400 group-hover:scale-110 group-hover:bg-white/10 group-hover:text-white",
                        )}
                      >
                        <Icon className="size-[17px]" aria-hidden />
                        {compact && count > 0 && (
                          <span
                            aria-hidden
                            className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-warning ring-2 ring-navy"
                          />
                        )}
                      </span>
                      {!compact && (
                        <>
                          <span className="min-w-0 flex-1 truncate transition-transform duration-200 group-hover:translate-x-0.5">
                            {item.label}
                          </span>
                          {count > 0 && (
                            <span
                              className="inline-flex min-w-5 items-center justify-center rounded-full bg-warning px-1.5 py-0.5 text-[11px] font-bold leading-none text-white"
                              aria-label={`${count} waiting for approval`}
                            >
                              {count}
                            </span>
                          )}
                          {item.comingSoon && (
                            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                              Soon
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl bg-white/5 py-2.5",
            compact ? "justify-center px-1" : "px-3",
          )}
          title={compact ? user.name : undefined}
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
            {initials(user.name)}
          </div>
          {!compact && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {user.name}
                </p>
                <p className="truncate text-xs text-slate-400">
                  {ROLE_LABELS[user.role]}
                </p>
              </div>
              <button
                onClick={() => logout()}
                aria-label="Sign out"
                title="Sign out"
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <LogOut className="size-4" />
              </button>
            </>
          )}
        </div>
        <button
          onClick={() => setFolded(!folded)}
          aria-label={folded ? "Expand menu" : "Fold menu"}
          title={folded ? "Expand menu" : "Fold menu"}
          className="mt-2 hidden w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold text-slate-400 transition-colors hover:bg-white/5 hover:text-white lg:flex"
        >
          {folded ? (
            <ChevronsRight className="size-4" aria-hidden />
          ) : (
            <>
              <ChevronsLeft className="size-4" aria-hidden />
              Fold menu
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside
        className={cn(
          "hidden shrink-0 bg-navy transition-[width] duration-300 ease-out lg:sticky lg:top-0 lg:block lg:h-screen",
          folded ? "w-[76px]" : "w-[260px]",
        )}
      >
        {render(folded)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="fade-in absolute inset-0 bg-navy/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <aside className="slide-in-left absolute left-0 top-0 h-full w-72 bg-navy shadow-xl">
            {render(false)}
          </aside>
        </div>
      )}
    </>
  );
}
