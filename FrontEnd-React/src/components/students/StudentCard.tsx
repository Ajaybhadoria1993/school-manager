import { Link } from "react-router";
import { ChevronRight, Phone } from "lucide-react";
import { TONES } from "../../constants/tones";
import { cn } from "../../utils/helpers";
import { ageText, avatarTone, formatMobile, placeLabel } from "../../utils/students";
import type { StudentRow } from "../../types";
import { StudentAvatar } from "./StudentAvatar";

/**
 * One student as a coloured card: their initials, name and admission number, this year's class and section as a chip, the roll
 * number, and the primary parent with their number. The whole card opens the student's page. Under the pointer it lifts and takes a
 * soft tint of the student's colour.
 */
export function StudentCard({ student, index }: { student: StudentRow; index: number }) {
  const t = TONES[avatarTone(student.admissionNumber)];
  const guardian = student.primaryGuardian;

  return (
    <li className="stagger-item" style={{ "--i": Math.min(index, 8) } as React.CSSProperties}>
      <Link
        to={`/school/students/${student.id}`}
        aria-label={`${student.name}, ${student.admissionNumber}, ${placeLabel(student.place)}`}
        className="group relative block h-full overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-transparent hover:shadow-float focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 sm:p-5"
      >
        <div aria-hidden className={cn("absolute -right-10 -top-10 size-36 rounded-full bg-gradient-to-br to-transparent blur-2xl transition-transform duration-500 group-hover:scale-150", t.glow)} />
        <div aria-hidden className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100", t.glow)} />

        <div className="relative flex items-start gap-3.5">
          <StudentAvatar name={student.name} seed={student.admissionNumber} className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-bold tracking-tight text-foreground">{student.name}</h3>
            <p className="truncate font-mono text-xs font-semibold text-foreground-muted">{student.admissionNumber}</p>
          </div>
          <ChevronRight className="mt-1 size-4 shrink-0 text-foreground-muted/60 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </div>

        <div className="relative mt-4 flex flex-wrap items-center gap-1.5">
          <span className={cn("rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ring-inset", t.chip)}>{placeLabel(student.place)}</span>
          {student.place?.rollNumber != null && (
            <span className="rounded-lg bg-surface-muted px-2.5 py-1 text-xs font-semibold text-foreground-muted ring-1 ring-inset ring-border">
              Roll {student.place.rollNumber}
            </span>
          )}
          <span className="rounded-lg bg-surface-muted px-2.5 py-1 text-xs font-semibold text-foreground-muted ring-1 ring-inset ring-border">
            {student.gender} · {ageText(student.dateOfBirth)}
          </span>
        </div>

        {guardian && (
          <p className="relative mt-3 flex min-w-0 items-center gap-1.5 border-t border-border pt-3 text-xs text-foreground-muted">
            <Phone className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              <span className="font-semibold text-foreground">{guardian.name}</span> ({guardian.relation})
              {guardian.mobile && <> · {formatMobile(guardian.mobile)}</>}
            </span>
          </p>
        )}
      </Link>
    </li>
  );
}
