import { ArrowRight, LogOut } from "lucide-react";
import { formatDay } from "../../../utils/academicYear";
import { istDay } from "../../../utils/students";
import type { PlaceSnapshot, StudentMove } from "../../../types";

/** "Class 6 - A (roll 9)": a class, its section and the roll number, as they were written down then. */
const placeText = (p: PlaceSnapshot | null) => (p ? `${p.className}${p.sectionName ? ` - ${p.sectionName}` : ""}${p.rollNumber != null ? ` (roll ${p.rollNumber})` : ""}` : "");

/**
 * The movements of a student, newest first: moved to another class, section or roll number, or transferred to another school. Each says
 * where from and where to, who did it, when and why. The class history above it is one row per year; this is what happened
 * inside the year, so nothing about where the student was is lost when they are moved.
 */
export function MovesList({ moves }: { moves: StudentMove[] }) {
  if (moves.length === 0) return null;
  return (
    <div className="mt-4">
      <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground-muted">Moves and transfers</h4>
      <ol aria-label="Moves and transfers" className="space-y-2">
        {moves.map((m) => (
          <li key={m.id} className="rounded-xl border border-border bg-surface px-3 py-2.5">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-foreground">
              {m.kind === "transferred_out" ? (
                <>
                  <LogOut className="size-4 text-warning" aria-hidden />
                  <span>Transferred to {m.school?.schoolName ?? "another school"}</span>
                  <span className="font-normal text-foreground-muted">from {placeText(m.from)}</span>
                </>
              ) : (
                <>
                  <ArrowRight className="size-4 text-info" aria-hidden />
                  <span>
                    {placeText(m.from)} <span className="font-normal text-foreground-muted">to</span> {placeText(m.to)}
                  </span>
                </>
              )}
            </p>
            {m.kind === "transferred_out" && m.school && (m.school.tcNumber || m.school.tcDate || m.school.remarks) && (
              <p className="mt-0.5 text-xs text-foreground-muted">
                {[m.school.tcNumber ? `Certificate ${m.school.tcNumber}` : null, m.school.tcDate ? `dated ${formatDay(m.school.tcDate)}` : null, m.school.remarks].filter(Boolean).join(" · ")}
              </p>
            )}
            <p className="mt-0.5 text-xs text-foreground-muted">
              {formatDay(istDay(m.at))} · by {m.by.name}
              {m.reason && m.kind === "moved" ? ` · ${m.reason}` : ""}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
