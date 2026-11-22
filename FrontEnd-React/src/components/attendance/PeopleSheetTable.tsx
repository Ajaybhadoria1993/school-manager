import { dayCount, isLowPercent, isWeekRange, lateText, percentText, showsEveryDay, teacherLook, weekdayLetter } from "../../utils/attendance";
import { shortDay } from "../../utils/calendar";
import { clock12 } from "../../utils/exams";
import { cn } from "../../utils/helpers";
import type { SheetDay, TeacherSheetRow } from "../../types";

const WEEKDAY_NAME = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TH = "whitespace-nowrap px-2.5 py-3 text-left text-[13.5px] font-semibold text-foreground";

/**
 * The sheet of the people who mark themselves present (the teachers; the staff, 2026-11-22), for the days read. For one day each person's
 * status, the time they came and how late; for a week (up to 7 days) a column for each day with the mark AND the time; for up to a month a
 * column for each day (P, L, A, H for a holiday; the time is in the hover) and the counts. A name opens that person's days (`onOpen`). Under the
 * name: a staff member's department, the post and the code.
 */
export function PeopleSheetTable({ rows, days, from, to, person, label, onOpen }: { rows: TeacherSheetRow[]; days: SheetDay[]; from: string; to: string; person: string; label: string; onOpen: (id: string) => void }) {
  const oneDay = days.length === 1;
  const grid = !oneDay && showsEveryDay(dayCount(from, to));
  // A week or less: each day's cell has the time the person came under the mark.
  const week = grid && isWeekRange(dayCount(from, to));
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
      <table aria-label={label} className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-surface-muted/60">
            <th scope="col" className={TH}>
              {person}
            </th>
            {oneDay ? (
              <>
                <th scope="col" className={TH}>
                  Status
                </th>
                <th scope="col" className={TH}>
                  Came at
                </th>
                <th scope="col" className={TH}>
                  Time
                </th>
              </>
            ) : (
              <>
                {grid &&
                  days.map((d) => (
                    <th
                      key={d.date}
                      scope="col"
                      aria-label={`${WEEKDAY_NAME[d.weekday]} ${shortDay(d.date)}${d.holiday ? `, Holiday: ${d.holiday}` : !d.working ? ", school is off" : ""}`}
                      className={cn(
                        "text-center font-bold leading-tight text-foreground-muted",
                        week ? "min-w-20 px-2 py-2.5 text-xs" : "px-1 py-2 text-[11px]",
                        d.holiday && "bg-info-soft text-info",
                        !d.working && !d.holiday && "opacity-50"
                      )}
                    >
                      <span className="block">{week ? WEEKDAY_NAME[d.weekday] : weekdayLetter(d.weekday)}</span>
                      <span className="block">{d.date.slice(8)}</span>
                    </th>
                  ))}
                <th scope="col" className={TH}>
                  Present
                </th>
                <th scope="col" className={TH}>
                  Late
                </th>
                <th scope="col" className={TH}>
                  Absent
                </th>
                <th scope="col" className={TH}>
                  %
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-t border-surface-muted hover:bg-background">
              <td className="px-3 py-2">
                <button type="button" onClick={() => onOpen(t.id)} className="max-w-[14rem] truncate text-left font-bold text-foreground hover:text-primary-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
                  {t.name}
                </button>
                {(t.department || t.designation || t.employeeCode) && (
                  <span className="block text-xs text-foreground-muted">{[t.department?.label, t.designation, t.employeeCode].filter(Boolean).join(" · ")}</span>
                )}
              </td>
              {oneDay ? (
                <>
                  <td className="px-3 py-2">
                    <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-bold", teacherLook(t.records[0].status).tone)}>{teacherLook(t.records[0].status).label}</span>
                  </td>
                  <td className="px-3 py-2 font-semibold text-foreground">{t.records[0].checkedInTime ? clock12(t.records[0].checkedInTime) : <span className="text-foreground-muted">–</span>}</td>
                  <td className={cn("px-3 py-2", t.records[0].status === "late" ? "font-semibold text-warning" : "text-foreground-muted")}>{lateText(t.records[0].lateByMinutes) || "–"}</td>
                </>
              ) : (
                <>
                  {grid &&
                    t.records.map((r) => {
                      const look = teacherLook(r.status);
                      const said = `${t.name}, ${shortDay(r.date)}: ${r.checkedInTime ? `${look.label} at ${clock12(r.checkedInTime)}` : r.status === "holiday" ? `Holiday: ${days.find((d) => d.date === r.date)?.holiday}` : look.label}${
                        r.status === "late" || r.status === "present" ? `, ${lateText(r.lateByMinutes)}` : ""
                      }`;
                      return (
                        <td key={r.date} className={cn("text-center", week ? "px-2 py-2" : "px-px py-1.5")}>
                          <span aria-label={said} title={said} className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded-md px-0.5 text-[11px] font-bold", look.tone)}>
                            {look.letter}
                          </span>
                          {/* A week has the room: the time the person came is written under the mark (amber when late). */}
                          {week && r.checkedInTime && (
                            <span className={cn("mt-0.5 block whitespace-nowrap text-[11px] font-semibold", r.status === "late" ? "text-warning" : "text-foreground-muted")}>{clock12(r.checkedInTime)}</span>
                          )}
                        </td>
                      );
                    })}
                  <td aria-label={`Present: ${t.tally.present}`} className="px-3 py-2 font-semibold text-success">
                    {t.tally.present}
                  </td>
                  <td aria-label={`Late: ${t.tally.late}`} className="px-3 py-2 font-semibold text-warning">
                    {t.tally.late}
                  </td>
                  <td aria-label={`Absent: ${t.tally.absent}`} className="px-3 py-2 font-semibold text-danger">
                    {t.tally.absent}
                  </td>
                  <td aria-label="Percentage" title={isLowPercent(t.tally.percent) ? "Below 75%" : undefined} className={cn("px-3 py-2 font-bold", isLowPercent(t.tally.percent) ? "text-danger" : "text-foreground")}>
                    {percentText(t.tally.percent)}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
