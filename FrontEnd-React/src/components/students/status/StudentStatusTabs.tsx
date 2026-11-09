import { NavLink } from "react-router";
import { UserCheck, UserX } from "lucide-react";
import { cn } from "../../../utils/helpers";

const TABS = [
  { to: "/school/students", label: "Active students", icon: UserCheck, end: true },
  { to: "/school/students/inactive", label: "Inactive students", icon: UserX, end: true },
] as const;

/**
 * The two lists of a school's students, side by side under the page's title: those who are in the school now (Active) and those who
 * left or were taken out (Inactive: kept whole, active again with one click). Each is a page of its own, so the address says which.
 */
export function StudentStatusTabs() {
  return (
    <nav aria-label="Students by status" className="inline-flex gap-1 rounded-xl border border-border bg-surface p-1 shadow-sm">
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              "inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
              isActive ? "bg-primary-soft text-primary-deep" : "text-foreground-muted hover:bg-background hover:text-foreground"
            )
          }
        >
          <Icon className="size-4" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
