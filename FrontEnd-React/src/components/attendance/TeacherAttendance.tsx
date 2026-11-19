import { useState } from "react";
import { useSearchParams } from "react-router";
import { CalendarX2, ClockAlert, UserRoundCheck, UsersRound } from "lucide-react";
import { useGetTeachersAttendanceQuery } from "../../redux/api/attendanceApi";
import { getApiError } from "../../utils/apiErrors";
import { dayCount, isLowPercent, isWeekRange, lateText, percentText, showsEveryDay, teacherLook, todayStartRange, weekdayLetter } from "../../utils/attendance";
import { useYearView } from "../../hooks/useYearView";
import { shortDay } from "../../utils/calendar";
import { clock12 } from "../../utils/exams";
import { cn } from "../../utils/helpers";
import { todayInIndia } from "../../utils/students";
import type { TeacherSheetRow } from "../../types";
import { StatTile } from "../dashboard/school/StatTile";
import { Card } from "../ui/Card";
import { DateRangeControl } from "../ui/DateRangeControl";
import { Skeleton } from "../ui/Skeleton";
import { TeacherDaysDialog } from "./TeacherDaysDialog";

const WEEKDAY_NAME = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TH = "whitespace-nowrap px-2.5 py-3 text-left text-[13.5px] font-semibold text-foreground";

/**
 * Teacher attendance for the school (Attendance > Teacher, 2026-11-06). Nobody takes it: a teacher marks themselves present in
 * the app and the time is kept; one who has not by the time school ends is Absent. It opens on today (2026-11-17), with the date filter of the
 * whole app (an arrow, a box, an arrow, and the window "Select date range"). For one day the sheet is each teacher's status, the time they came and
 * how late; for a week (up to 7 days) a column for each day with the mark AND the time the teacher came; for up to a month a column for each day
 * (P, L, A, H for a holiday; the time is in the hover) and the counts. A teacher's name opens their days with the log. The sheet reads again by
 * itself when a teacher marks (the live line: `useLiveNotifications`).
 */
export function TeacherAttendance() {
  const [params, setParams] = useSearchParams();
  const today = todayInIndia();
  const { viewing } = useYearView();
  const start = todayStartRange(today, viewing);
  const range = { from: params.get("from") ?? start.from, to: params.get("to") ?? start.to };
  const res = useGetTeachersAttendanceQuery(range);
  const data = res.data?.data;
  // The window shows the row as the sheet has it now, so a day just changed shows its new word.
  const [openId, setOpenId] = useState<string | null>(null);
  const open: TeacherSheetRow | undefined = data?.teachers.find((t) => t.id === openId);

  function change(next: { from: string; to: string }) {
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        out.set("from", next.from);
        out.set("to", next.to);
        return out;
      },
      { replace: true }
    );
  }

  const oneDay = !!data && data.days.length === 1;
  const grid = !!data && !oneDay && showsEveryDay(dayCount(data.from, data.to));
  // A week or less: each day's cell has the time the teacher came under the mark.
  const week = grid && isWeekRange(dayCount(data.from, data.to));

  return (
    <div className="space-y-5">
      {/* The toolbar: the days on the left, and for one day when school runs on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeControl range={range} noFuture onChange={change} />
        {oneDay && data.days[0].start && data.days[0].end && (
          <p className="rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-semibold text-foreground-muted shadow-card">
            {shortDay(data.days[0].date)} · School {clock12(data.days[0].start)} to {clock12(data.days[0].end)}
          </p>
        )}
      </div>

      {res.isFetching && !data ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !data ? (
        <Card className="px-5 py-10 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the attendance."}</Card>
      ) : (
        <>
          <section aria-label="About the teachers' attendance" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Teachers" value={data.summary.teachers} icon={UsersRound} tone="primary" />
            <StatTile label="Present" value={data.summary.present} icon={UserRoundCheck} tone="success" />
            <StatTile label="Late" value={data.summary.late} icon={ClockAlert} tone="warning" />
            <StatTile label="Absent" value={data.summary.absent} icon={CalendarX2} tone="danger" />
          </section>

          {data.teachers.length === 0 ? (
            <Card className="px-5 py-10 text-center text-sm text-foreground-muted">No teacher yet</Card>
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
              <table aria-label={oneDay ? "Attendance of the teachers on the day" : "Attendance of the teachers"} className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-surface-muted/60">
                    <th scope="col" className={TH}>
                      Teacher
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
                          data.days.map((d) => (
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
                  {data.teachers.map((t) => (
                    <tr key={t.id} className="border-t border-surface-muted hover:bg-background">
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => setOpenId(t.id)} className="max-w-[14rem] truncate text-left font-bold text-foreground hover:text-primary-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
                          {t.name}
                        </button>
                        {(t.designation || t.employeeCode) && <span className="block text-xs text-foreground-muted">{[t.designation, t.employeeCode].filter(Boolean).join(" · ")}</span>}
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
                              const said = `${t.name}, ${shortDay(r.date)}: ${r.checkedInTime ? `${look.label} at ${clock12(r.checkedInTime)}` : r.status === "holiday" ? `Holiday: ${data.days.find((d) => d.date === r.date)?.holiday}` : look.label}${
                                r.status === "late" || r.status === "present" ? `, ${lateText(r.lateByMinutes)}` : ""
                              }`;
                              return (
                                <td key={r.date} className={cn("text-center", week ? "px-2 py-2" : "px-px py-1.5")}>
                                  <span aria-label={said} title={said} className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded-md px-0.5 text-[11px] font-bold", look.tone)}>
                                    {look.letter}
                                  </span>
                                  {/* A week has the room: the time the teacher came is written under the mark (amber when late). */}
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
          )}
        </>
      )}
      {open && <TeacherDaysDialog teacher={open} canChange onClose={() => setOpenId(null)} />}
    </div>
  );
}
