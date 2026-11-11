import { useState } from "react";
import { Link, useLocation } from "react-router";
import { ChevronDown, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { cn } from "../../utils/helpers";
import { useAuth } from "../../hooks/useAuth";
import { useSidebarCollapsed } from "../../hooks/useSidebarCollapsed";
import { BrandMark } from "../brand/BrandMark";
import { FOLDING_GROUPS, NAV_ITEMS, SUBMENUS, activeNavItem, groupLabel, navVisible, pathForMenu, type NavItem } from "./nav-config";
import { usePending } from "../../hooks/usePending";

/**
 * The light menu. On a laptop it can fold down to icons (remembered on this device); on a phone it slides in as a drawer.
 * Items are grouped under small headings, and planned modules carry a "Soon" tag. A group listed in FOLDING_GROUPS
 * ("Manage school") is one row that opens its pages when clicked, and is already open on one of its pages. Pages with a `submenu` are
 * nested under a row of their own that opens the same way: Timetable inside Manage school, Attendance at the first level.
 */
export function Sidebar({
  mobileOpen,
  onClose,
}: {
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const location = useLocation();
  const { user, tenant } = useAuth();
  const { pending } = usePending();
  const [folded, setFolded] = useSidebarCollapsed();

  const items = user ? NAV_ITEMS.filter((item) => navVisible(item, user)) : [];
  const current = activeNavItem(pathForMenu(location), items);

  // What the person opened or closed by hand; until then a folding group is open exactly when one of its pages is showing.
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  // Arriving on a page of a closed group (a link on the dashboard, the back button) opens the group so the page is visible.
  const [seenHref, setSeenHref] = useState(current?.href);
  if (seenHref !== current?.href) {
    setSeenHref(current?.href);
    if (current) setChosen((c) => ({ ...c, ...(FOLDING_GROUPS[current.group] ? { [current.group]: true } : {}), ...(current.submenu ? { [`sub:${current.submenu}`]: true } : {}) }));
  }

  if (!user) return null;
  const isSuperAdmin = user.role === "super_admin";

  // Group in the order the items appear.
  const groups: { name: string; items: typeof items }[] = [];
  for (const item of items) {
    const name = groupLabel(item.group, user.role);
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.items.push(item);
    else groups.push({ name, items: [item] });
  }

  /** The rows of a group in order: a page, or a submenu row with the pages that sit next to each other under it. */
  const entriesOf = (groupItems: NavItem[]) => {
    const entries: ({ link: NavItem } | { sub: string; items: NavItem[] })[] = [];
    for (const item of groupItems) {
      const last = entries[entries.length - 1];
      if (!item.submenu) entries.push({ link: item });
      else if (last && "sub" in last && last.sub === item.submenu) last.items.push(item);
      else entries.push({ sub: item.submenu, items: [item] });
    }
    return entries;
  };

  /** One page of the menu. `nested` is a page inside a folding group (smaller, indented). */
  const renderLink = (item: NavItem, compact: boolean, nested = false) => {
    const active = item === current;
    const Icon = item.icon;
    const count = item.showPendingBadge ? pending : 0;
    return (
      <li key={item.href}>
        <Link
          to={item.href}
          onClick={onClose}
          aria-current={active ? "page" : undefined}
          title={compact ? (item.title ?? item.label) : undefined}
          className={cn(
            "group relative flex items-center gap-3 rounded-xl text-[15px] font-medium transition-all duration-200",
            nested && !compact ? "py-1.5 pl-2.5 pr-2" : "py-1.5",
            compact ? "justify-center px-1.5" : !nested && "px-2",
            active
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
          )}
        >
          <span
            className={cn(
              "relative flex shrink-0 items-center justify-center rounded-lg transition-all duration-200",
              nested && !compact ? "size-7" : "size-8",
              active
                ? "bg-white/15 text-white"
                : "bg-surface-muted text-foreground-muted group-hover:scale-110 group-hover:bg-border group-hover:text-foreground",
            )}
          >
            <Icon className={nested && !compact ? "size-[15px]" : "size-[17px]"} aria-hidden />
            {compact && count > 0 && (
              <span
                aria-hidden
                className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-warning ring-2 ring-surface"
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
                <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground-muted">
                  Soon
                </span>
              )}
            </>
          )}
        </Link>
      </li>
    );
  };

  /**
   * A row that opens its own pages, one step further in: Attendance (Student, Teacher, Staff) at the first level of the menu (`topLevel`, as
   * big as the entries around it), Timetable (School timings, Class timetables) inside Manage school. In the folded (icons only) menu there
   * is no room for a row of its own: its pages are shown as plain icons.
   */
  const renderSub = (name: string, subItems: NavItem[], compact: boolean, topLevel = false) => {
    if (compact) return subItems.map((item) => renderLink(item, true, !topLevel));
    const Icon = SUBMENUS[name].icon;
    const hasCurrent = subItems.includes(current as NavItem);
    const key = `sub:${name}`;
    const open = chosen[key] ?? hasCurrent;
    const panelId = `fold-sub-${name.toLowerCase().replace(/\W+/g, "-")}`;
    return (
      <li key={key}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setChosen((c) => ({ ...c, [key]: !open }))}
          className={cn(
            "group flex w-full items-center gap-3 rounded-xl py-1.5 text-[15px] font-medium transition-all duration-200",
            topLevel ? "px-2" : "pl-2.5 pr-2",
            hasCurrent || open ? "bg-surface-muted text-foreground" : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
          )}
        >
          <span
            className={cn(
              "flex shrink-0 items-center justify-center rounded-lg transition-all duration-200",
              topLevel ? "size-8" : "size-7",
              hasCurrent
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-surface-muted text-foreground-muted group-hover:scale-110 group-hover:bg-border group-hover:text-foreground",
            )}
          >
            <Icon className={topLevel ? "size-[17px]" : "size-[15px]"} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate text-left">{name}</span>
          <ChevronDown className={cn(topLevel ? "size-4" : "size-3.5", "text-foreground-muted transition-transform duration-300", open && "rotate-180")} aria-hidden />
        </button>
        <div
          id={panelId}
          className={cn(
            "grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-out",
            open ? "visible grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0",
          )}
        >
          <ul inert={!open} className="ml-[1.1rem] mt-0.5 min-h-0 space-y-0.5 overflow-hidden border-l border-border pl-3">
            {subItems.map((item) => renderLink(item, false, true))}
          </ul>
        </div>
      </li>
    );
  };

  /** A folding group: one row ("Manage school") that opens its pages underneath when it is clicked. */
  const renderFold = (name: string, groupItems: NavItem[], compact: boolean) => {
    const Icon = FOLDING_GROUPS[name].icon;
    const hasCurrent = groupItems.includes(current as NavItem);
    const open = chosen[name] ?? hasCurrent;
    const panelId = `fold-${name.toLowerCase().replace(/\W+/g, "-")}`;
    return (
      <>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          title={compact ? name : undefined}
          onClick={() => setChosen((c) => ({ ...c, [name]: !open }))}
          className={cn(
            "group flex w-full items-center gap-3 rounded-xl py-1.5 text-[15px] font-medium transition-all duration-200",
            compact ? "justify-center px-1.5" : "px-2",
            hasCurrent || open
              ? "bg-surface-muted text-foreground"
              : "text-foreground-muted hover:bg-surface-muted hover:text-foreground",
          )}
        >
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
              hasCurrent
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-surface-muted text-foreground-muted group-hover:scale-110 group-hover:bg-border group-hover:text-foreground",
            )}
          >
            <Icon className="size-[17px]" aria-hidden />
          </span>
          {!compact && (
            <>
              <span className="min-w-0 flex-1 truncate text-left">{name}</span>
              <ChevronDown
                className={cn("size-4 text-foreground-muted transition-transform duration-300", open && "rotate-180")}
                aria-hidden
              />
            </>
          )}
        </button>

        {/* The grid-rows trick lets the list grow from zero height to its own height, which a plain height cannot animate. */}
        <div
          id={panelId}
          className={cn(
            "grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-out",
            // "invisible" (visibility) switches at the end of the close, so the hidden pages cannot be tabbed to or read out.
            open ? "visible grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0",
          )}
        >
          <ul
            inert={!open}
            className={cn(
              "min-h-0 space-y-0.5 overflow-hidden",
              compact ? "mt-0.5" : "ml-[1.15rem] mt-0.5 border-l border-border pl-3",
            )}
          >
            {entriesOf(groupItems).map((entry) => ("link" in entry ? renderLink(entry.link, compact, true) : renderSub(entry.sub, entry.items, compact)))}
          </ul>
        </div>
      </>
    );
  };

  /** `compact` is the folded look; the phone drawer is never folded. */
  const render = (compact: boolean) => (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex items-center gap-1 pb-4 pt-5",
          compact ? "justify-between px-1" : "justify-between px-4",
        )}
      >
        <BrandMark
          href="/dashboard"
          onClick={onClose}
          size="sm"
          tone="default"
          compact={compact}
          tagline={
            isSuperAdmin ? "Platform console" : (tenant?.name ?? "School")
          }
        />
        <button
          onClick={onClose}
          aria-label="Close menu"
          className="rounded-lg p-1.5 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground lg:hidden"
        >
          <X className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setFolded(!folded)}
          aria-label={folded ? "Expand menu" : "Fold menu"}
          title={folded ? "Expand menu" : "Fold menu"}
          className="hidden size-8 shrink-0 items-center justify-center rounded-lg text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground lg:inline-flex"
        >
          {folded ? <ChevronsRight className="size-4" aria-hidden /> : <ChevronsLeft className="size-4" aria-hidden />}
        </button>
      </div>

      <nav
        aria-label="Main"
        className="sidebar-scroll flex-1 overflow-y-auto px-3 pb-4"
      >
        {groups.map((group, gi) => {
          const folding = !!FOLDING_GROUPS[group.name];
          return (
            <div key={group.name} className={cn(gi > 0 && "mt-4")}>
              {folding ? (
                renderFold(group.name, group.items, compact)
              ) : (
                <>
                  {compact ? (
                    gi > 0 && <div aria-hidden className="mx-3 mb-2 h-px bg-border" />
                  ) : (
                    <p className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-foreground-muted">
                      {group.name}
                    </p>
                  )}
                  <ul className="space-y-0.5">{entriesOf(group.items).map((entry) => ("link" in entry ? renderLink(entry.link, compact) : renderSub(entry.sub, entry.items, compact, true)))}</ul>
                </>
              )}
            </div>
          );
        })}
      </nav>

    </div>
  );

  return (
    <>
      <aside
        className={cn(
          "hidden h-full shrink-0 border-r border-border bg-surface transition-[width] duration-300 ease-out lg:sticky lg:top-0 lg:block",
          folded ? "w-[76px]" : "w-[260px]",
        )}
      >
        {render(folded)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="fade-in absolute inset-0 bg-slate-900/35 backdrop-blur-sm"
            onClick={onClose}
          />
          <aside className="slide-in-left absolute left-0 top-0 h-full w-72 border-r border-border bg-surface shadow-xl">
            {render(false)}
          </aside>
        </div>
      )}
    </>
  );
}
