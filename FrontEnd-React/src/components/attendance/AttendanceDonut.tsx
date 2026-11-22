import type { AttendanceStatus } from "../../types";

/** The four marks as the ring draws them, in the order round the ring. */
const SEGMENTS: { status: AttendanceStatus; stroke: string }[] = [
  { status: "present", stroke: "stroke-success" },
  { status: "late", stroke: "stroke-warning" },
  { status: "absent", stroke: "stroke-danger" },
  { status: "leave", stroke: "stroke-info" },
];

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The ring of "Today's summary" (2026-11-22, the reference pictures): a piece for each mark (present, late, absent, leave) and, in the
 * middle, how many of the class came (late is there: the same rule as the register's percentage, `cameToSchool`). The picture is one
 * image with its percentage as its name; the numbers themselves are written beside it by the page.
 * `taken={false}` (2026-11-23): nobody has taken the day, so the ring is empty and says "Not taken" instead of a 0% that would read as a
 * whole class absent.
 */
export function AttendanceDonut({ counts, taken = true }: { counts: Record<AttendanceStatus, number>; taken?: boolean }) {
  const total = counts.present + counts.absent + counts.late + counts.leave;
  const percent = total === 0 ? 0 : Math.round(((counts.present + counts.late) / total) * 100);
  let used = 0;
  return (
    <div className="relative mx-auto size-40">
      <svg role="img" aria-label={taken ? `${percent}% came to school` : "Attendance not taken"} viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="12" className="stroke-surface-muted" />
        {taken &&
          total > 0 &&
          SEGMENTS.map(({ status, stroke }) => {
            const n = counts[status];
            if (n === 0) return null;
            const length = (n / total) * CIRCUMFERENCE;
            const piece = (
              <circle
                key={status}
                cx="50"
                cy="50"
                r={RADIUS}
                fill="none"
                strokeWidth="12"
                strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                strokeDashoffset={-used}
                className={stroke}
              />
            );
            used += length;
            return piece;
          })}
      </svg>
      <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold leading-none text-foreground">{taken ? `${percent}%` : "–"}</span>
        <span className="mt-1 text-xs font-semibold text-foreground-muted">{taken ? "Came" : "Not taken"}</span>
      </div>
    </div>
  );
}
