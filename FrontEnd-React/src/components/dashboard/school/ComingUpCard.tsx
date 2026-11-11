import { Link } from "react-router";
import { ArrowRight, CalendarDays, FileText, Sun, type LucideIcon } from "lucide-react";
import type { SchoolDashboard } from "../../../types";
import { shortRange } from "../../../utils/dashboard";
import { DashCard } from "./DashCard";

const KIND: Record<SchoolDashboard["upcoming"][number]["kind"], { label: string; icon: LucideIcon }> = {
  holiday: { label: "Holiday", icon: Sun },
  event: { label: "Event", icon: CalendarDays },
  exam: { label: "Exam", icon: FileText },
};

/** The next holidays, events and exams (at most five, from today on, soonest first), each with its date; a link to the whole calendar. */
export function ComingUpCard({ upcoming }: { upcoming: SchoolDashboard["upcoming"] }) {
  return (
    <DashCard
      title="Coming up"
      aside={
        <Link to="/calendar" className="inline-flex items-center gap-1 text-primary hover:text-primary-deep">
          Open calendar
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      }
    >
      {upcoming.length === 0 ? (
        <p className="text-sm text-foreground-muted">Nothing is planned in the next 30 days</p>
      ) : (
        <ul className="space-y-2.5">
          {upcoming.map((u) => {
            const kind = KIND[u.kind];
            return (
              <li key={`${u.kind}-${u.title}-${u.startDate}`} className="flex items-center gap-3">
                <span className="min-w-[6.25rem] shrink-0 whitespace-nowrap rounded-lg bg-primary-soft px-2 py-1.5 text-center text-xs font-bold text-primary-deep">{shortRange(u.startDate, u.endDate)}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={u.title}>
                  {u.title}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-foreground-muted">
                  <kind.icon className="size-3.5" aria-hidden />
                  {kind.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </DashCard>
  );
}
