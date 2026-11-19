import { Link } from "react-router";
import { Check, DoorOpen, UserRound, Users } from "lucide-react";
import { TONES, type Tone } from "../../constants/tones";
import { cn } from "../../utils/helpers";
import type { ClassOverview } from "../../types";
import { SEAT_LOOK } from "./seatLook";

/** The "section" of the address that stands for the whole class (no section chosen is nothing at all). */
export const ALL_SECTIONS = "all";

/**
 * The sections of one class as cards to pick from: "All sections" first (everyone in the class), then one card for each section with its
 * students, its room and how full its seats are. The picked card is outlined and the students below are that section's. Each card is a
 * link to the same page with `?section=`, so the choice is in the address (back button, a copied link).
 */
export function SectionPicker({
  overview,
  tone,
  picked,
  to,
}: {
  overview: ClassOverview;
  tone: Tone;
  /** "" while nothing is chosen, `ALL_SECTIONS` for the whole class, or a section id. */
  picked: string;
  /** The address of this page with that section chosen. */
  to: (section: string) => string;
}) {
  const t = TONES[tone];
  const card = (active: boolean) =>
    cn(
      "relative block rounded-xl border bg-surface p-3.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
      active ? "border-primary bg-primary-soft/40 shadow-card ring-1 ring-primary" : "border-border hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-card"
    );

  return (
    <nav aria-label={`Sections of ${overview.name}`} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Link to={to(ALL_SECTIONS)} aria-current={picked === ALL_SECTIONS ? "page" : undefined} className={card(picked === ALL_SECTIONS)}>
        <span className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-bold text-foreground">
            <span aria-hidden className={cn("flex size-7 items-center justify-center rounded-lg", t.tile)}>
              <Users className="size-4" />
            </span>
            All sections
          </span>
          {picked === ALL_SECTIONS && <Check className="size-4 text-primary" aria-hidden />}
        </span>
        <span className="mt-2 block text-stat-value">{overview.students}</span>
        <span className="text-xs text-foreground-muted">{overview.students === 1 ? "student" : "students"} in the whole class</span>
      </Link>

      {overview.sections.map((s) => {
        const active = picked === s.id;
        const look = SEAT_LOOK[s.state];
        return (
          <Link key={s.id} to={to(s.id)} aria-current={active ? "page" : undefined} className={card(active)}>
            <span className="flex items-center justify-between gap-2">
              <span className="text-lg font-bold leading-none text-foreground">Section {s.name}</span>
              {active ? <Check className="size-4 text-primary" aria-hidden /> : <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", look.badge)}>{look.label}</span>}
            </span>
            <span className="mt-2 block text-stat-value">{s.enrolled}</span>
            <span className="text-xs text-foreground-muted">{s.capacity === null ? `${s.enrolled === 1 ? "student" : "students"}, no seat limit` : `of ${s.capacity} seats filled`}</span>
            {s.capacity !== null && (
              <span aria-hidden className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <span className={cn("block h-full rounded-full", look.bar)} style={{ width: `${s.percent}%` }} />
              </span>
            )}
            {s.room && (
              <span className="mt-2 flex items-center gap-1 text-xs font-semibold text-foreground-muted">
                <DoorOpen className="size-3.5" aria-hidden />
                {s.room}
              </span>
            )}
            {s.classTeacher && (
              <span className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-foreground" title="Class teacher">
                <UserRound className="size-3.5 text-primary" aria-hidden />
                {s.classTeacher.name}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
