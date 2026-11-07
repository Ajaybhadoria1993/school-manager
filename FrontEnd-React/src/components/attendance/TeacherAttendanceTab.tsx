import { useState } from "react";
import { useSearchParams } from "react-router";
import { CalendarX2, ClockAlert, UserRoundCheck, UsersRound } from "lucide-react";
import { useGetTeachersAttendanceQuery } from "../../redux/api/attendanceApi";
import { getApiError } from "../../utils/apiErrors";
import { dayCount, isLowPercent, lateText, percentText, rangePresets, showsEveryDay, teacherLook, weekdayLetter } from "../../utils/attendance";
import { shortDay } from "../../utils/calendar";
import { clock12 } from "../../utils/exams";
import { cn } from "../../utils/helpers";
import { todayInIndia } from "../../utils/students";
import type { TeacherSheetRow } from "../../types";
import { StatTile } from "../dashboard/school/StatTile";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";
import { RangeFilter } from "./RangeFilter";
import { TeacherDaysDialog } from "./TeacherDaysDialog";

const WEEKDAY_NAME = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TH = "whitespace-nowrap px-2.5 py-3 text-left text-xs font-bold uppercase tracking-wider text-foreground-muted";

/**
 * Teacher attendance for the school (the Teacher tab of Attendance, 2026-11-06). Nobody takes it: a teacher marks themselves present in
 * the app and the time is kept; one who has not by the time school ends is Absent. For one day (Today) the sheet is each teacher's status,
 * the time they came and how late; for more days it is a column for each day up to a month (P, L, A, H for a holiday) and the counts. A
 * teacher's name opens their days with the log. The sheet reads again by itself when a teacher marks (the live line: `useLiveNotifications`).
 */
export function TeacherAttendanceTab() {
  const [params, setParams] = useSearchParams();
  const today = todayInIndia();
  const month = rangePresets(today).find((p) => p.id === "month")!;
  const range = { from: params.get("from") ?? month.from, to: params.get("to") ?? month.to };
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

  return (
    <div className="space-y-5">
      <RangeFilter idPrefix="teachers" range={range} onChange={change} />

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

          {oneDay && data.days[0].start && data.days[0].end && (
            <p className="text-sm font-semibold text-foreground-muted">
              {shortDay(data.days[0].date)} · School {clock12(data.days[0].start)} to {clock12(data.days[0].end)}
            </p>
          )}

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
                              className={cn("px-1 py-2 text-center text-[11px] font-bold leading-tight text-foreground-muted", d.holiday && "bg-info-soft text-info", !d.working && !d.holiday && "opacity-50")}
                            >
                              <span className="block">{weekdayLetter(d.weekday)}</span>
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
                                <td key={r.date} className="px-px py-1.5 text-center">
                                  <span aria-label={said} title={said} className={cn("inline-flex h-6 min-w-6 items-center justify-center rounded-md px-0.5 text-[11px] font-bold", look.tone)}>
                                    {look.letter}
                                  </span>
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
