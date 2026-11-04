import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { TONES, type Tone } from "../../constants/tones";
import { classMark, plural } from "../../utils/academics";
import { cn } from "../../utils/helpers";
import type { ClassOverview } from "../../types";
import { SEAT_LOOK } from "./seatLook";

/**
 * One class at a glance, as a card in its department's colour: its mark and name, how many students are in it (the big number), how
 * many sections, how full the seats are together, and each section with its own count ("A 20/40"). The class name is the link that
 * opens the class (stretched over the whole card, so the keyboard and a new tab work); each section is a link of its own that opens the
 * class on that section's students.
 */
export function ClassOverviewCard({ overview, tone, index }: { overview: ClassOverview; tone: Tone; index: number }) {
  const t = TONES[tone];
  const { id, name, students, sections, seats, seatsLeft, percent } = overview;

  return (
    <article
      className="stagger-item group relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-card transition-all duration-300 focus-within:ring-4 focus-within:ring-primary/20 hover:-translate-y-1 hover:border-transparent hover:shadow-float sm:p-5"
      style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
    >
      <div aria-hidden className={cn("absolute -right-10 -top-10 size-36 rounded-full bg-gradient-to-br to-transparent blur-2xl transition-transform duration-500 group-hover:scale-150", t.glow)} />

      <div className="relative flex items-start gap-3.5">
        <span aria-hidden className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold tracking-tight transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105", t.gradient)}>
          {classMark(name)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold tracking-tight text-foreground">
            <Link
              to={`/school-class/${id}`}
              aria-label={`${name}: ${plural(students, "student")}, ${sections.length === 0 ? "no sections" : plural(sections.length, "section")}`}
              className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
            >
              {name}
            </Link>
          </h3>
          <p className="mt-0.5 text-xs text-foreground-muted">{sections.length === 0 ? "No sections: the class sits together" : plural(sections.length, "section")}</p>
        </div>
        <p className="text-right">
          <span className="block text-2xl font-extrabold leading-none tracking-[-0.03em] text-foreground">{students}</span>
          <span className="mt-1 block text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">{students === 1 ? "student" : "students"}</span>
        </p>
      </div>

      {seats > 0 && (
        <div className="relative mt-4">
          <div className="flex items-center justify-between text-xs font-semibold text-foreground-muted">
            <span>
              {percent}% of {seats} seats filled
            </span>
            <span>{seatsLeft} left</span>
          </div>
          <div aria-hidden className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <div className={cn("h-full rounded-full transition-[width] duration-500", percent >= 100 ? "bg-danger" : percent >= 85 ? "bg-amber-500" : t.line)} style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      {sections.length > 0 && (
        <ul className="relative z-10 mt-4 flex flex-wrap gap-1.5" aria-label={`Sections of ${name}`}>
          {sections.map((s) => (
            <li key={s.id}>
              <Link
                to={`/school-class/${id}?section=${s.id}`}
                title={`${s.name}: ${s.capacity === null ? `${s.enrolled} students, no seat limit` : `${s.enrolled} of ${s.capacity} seats (${SEAT_LOOK[s.state].label})`}. Open its students.`}
                className={cn("inline-flex max-w-full items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ring-inset transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2", t.chip)}
              >
                <span className="truncate">{s.name}</span>
                <span className="font-semibold opacity-80">{s.capacity === null ? s.enrolled : `${s.enrolled}/${s.capacity}`}</span>
                {s.state === "full" && <span aria-hidden className="size-1.5 rounded-full bg-danger" />}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p aria-hidden className="relative mt-4 inline-flex items-center gap-1 text-xs font-bold text-primary-deep">
        View students
        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </p>
    </article>
  );
}
