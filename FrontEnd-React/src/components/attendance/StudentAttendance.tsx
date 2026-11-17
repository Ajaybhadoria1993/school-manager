import { useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { Backpack, CalendarCheck2, CalendarX2, Percent } from "lucide-react";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useGetStudentsAttendanceQuery, useGetStudentsTodayQuery } from "../../redux/api/attendanceApi";
import { useGetRegisterQuery, useMarkStudentDayMutation } from "../../redux/api/classroomApi";
import { getApiError } from "../../utils/apiErrors";
import { attendanceUnits, cameToSchool, dayCount, isLowPercent, pickedUnit, isWeekRange, percentText, showsEveryDay, studentStartRange, weekColumns, weekdayLetter } from "../../utils/attendance";
import { useYearView } from "../../hooks/useYearView";
import { useAppSelector } from "../../redux/hooks";
import { shortDay } from "../../utils/calendar";
import { cn } from "../../utils/helpers";
import { STUDENT_PAGE_SIZES } from "../../constants/students";
import { todayInIndia } from "../../utils/students";
import type { AttendanceStatus, RegisterDay, StudentRangeDay, StudentRangeRow } from "../../types";
import { StatTile } from "../dashboard/school/StatTile";
import { StudentPager } from "../students/StudentPager";
import { Card } from "../ui/Card";
import { DateRangeControl } from "../ui/DateRangeControl";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/toast-context";
import { DaySplitDialog } from "./DaySplitDialog";
import { MarkMenu, type Answer } from "./MarkMenu";
import { NotTakenStrip } from "./NotTakenStrip";
import { StudentDaysDialog } from "./StudentDaysDialog";

/**
 * What is said of a mark (the hover and the screen reader: the true word and the reason). What is SHOWN is two things only (2026-11-17):
 * a P for a child who came (present or late) and an A for one who did not (absent or leave), so only `present` and `absent` are drawn.
 * `tone` is the soft mark of a month grid; `strong` the fuller circle of a week's register (the reference's).
 */
const MARK: Record<AttendanceStatus, { letter: string; word: string; tone: string; strong: string }> = {
  present: { letter: "P", word: "Present", tone: "bg-success-soft text-success", strong: "bg-success/20 text-success" },
  absent: { letter: "A", word: "Absent", tone: "bg-danger-soft text-danger", strong: "bg-danger/20 text-danger" },
  late: { letter: "L", word: "Late", tone: "bg-warning-soft text-warning", strong: "bg-warning/25 text-warning" },
  leave: { letter: "Lv", word: "Leave", tone: "bg-info-soft text-info", strong: "bg-info/20 text-info" },
};
const WEEKDAY_NAME = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TH = "whitespace-nowrap border-b px-3 py-3 text-left text-[13px] font-semibold text-foreground";
const THC = "whitespace-nowrap border-b px-3 py-3 text-center text-[13px] font-semibold text-foreground";

/** A group of choices that is one at a time, drawn as chips (the classes, the sections). */
function Chips({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    // On a wide screen (1420px and more) the choices are ONE line (the reference's); a screen too narrow for them scrolls the line, a phone wraps it.
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5 min-[1420px]:-m-1 min-[1420px]:flex-nowrap min-[1420px]:overflow-x-auto min-[1420px]:p-1">
      {options.map((o) => (
        <label key={o.value} className="relative block shrink-0">
          <input type="radio" className="peer sr-only" name={`chips-${label}`} checked={value === o.value} onChange={() => onChange(o.value)} />
          <span
            className={cn(
              "inline-flex h-8 cursor-pointer select-none items-center whitespace-nowrap rounded-lg border px-2 text-[12.5px] font-semibold transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20",
              value === o.value ? "border-transparent bg-primary-soft text-primary-deep ring-2 ring-inset ring-primary/40" : "border-border bg-surface text-foreground hover:border-primary/50"
            )}
          >
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}

/** One line of the Filters card: its name on the left (above on a phone), the choices beside it. */
function FilterRow({ label, tall = false, children }: { label: string; tall?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-2">
      {/* `tall`: the row holds the 40px date box, so the name sits level with its middle. */}
      <span aria-hidden className={cn("shrink-0 text-[13px] font-medium text-foreground sm:w-[4.5rem]", tall ? "sm:pt-2.5" : "sm:pt-1.5")}>
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** One class, or one section of it: what a class teacher's register is about (their class page). */
export interface RegisterUnit {
  classId: string;
  sectionId: string | null;
}

/**
 * Student attendance for the school (Attendance > Student, 2026-11-06): ONE row of classes (2026-11-17): a class with one section (or none) is
 * "Class 1"; a class with two or more is one chip a section, "Class 5A", "Class 5B". No Section row, no "All sections". The children of what is picked come with their marks for the days asked (this week, Monday to Saturday, to start
 * with since 2026-11-16): a column for each day up to a month (P, A, L; a day nobody took is empty, a holiday is said), then their counts and
 * percentage; a longer range shows the counts only. A week or less is a register: bigger marks and a Remarks column with the reasons.
 * A day's heading opens that day in two sides, Present and Absent. A child's name opens their days with the reason of each absence.
 * What is picked is kept in the address.
 *
 * Since 2026-11-17 the school ONLY LOOKS: nothing in this register can be clicked to mark. The class teacher has it in their class page
 * (`unit`: the one class, so no class or section to pick and no list of classes), with `canMark`: a cell with no mark says "Not taken" and a
 * click on it (or on a P / A) opens Present / Absent for that child and day. Only the class teacher of the class marks (the server checks).
 */
export function StudentAttendance({ unit, canMark = false }: { unit?: RegisterUnit; canMark?: boolean } = {}) {
  const [params, setParams] = useSearchParams();
  const structure = useGetStructureQuery(undefined, { skip: !!unit });
  const classes = structure.data?.data.classes ?? [];
  const today = todayInIndia();
  const { viewing } = useYearView();
  // Only the class teacher marks (a cell of their own class's register); nobody marks in a year that is over.
  const canTake = canMark && !viewing;
  const start = studentStartRange(today, viewing);

  // The chips: a class with one section (or none) is one, a class with more is one chip a section (Class 5A, Class 5B).
  const units = unit ? [] : attendanceUnits(classes);
  const picked = unit ? undefined : pickedUnit(units, params.get("class"), params.get("section"));
  const range = { from: params.get("from") ?? start.from, to: params.get("to") ?? start.to };

  const schoolRes = useGetStudentsAttendanceQuery({ classId: picked?.classId ?? "", sectionId: picked?.sectionId ?? "all", ...range }, { skip: !picked || !!unit });
  const classRes = useGetRegisterQuery({ classId: unit?.classId ?? "", sectionId: unit?.sectionId ?? null, ...range }, { skip: !unit });
  const res = unit ? classRes : schoolRes;
  const data = res.data?.data;
  const [open, setOpen] = useState<StudentRangeRow | null>(null);
  // The day whose Present / Absent sides are open.
  const [splitDay, setSplitDay] = useState<StudentRangeDay | null>(null);
  // The cell whose Present / Absent menu is open (2026-11-17): the child, the day and what the cell says now.
  const [menu, setMenu] = useState<{ student: StudentRangeRow; day: RegisterDay; current: Answer | null } | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const [markDay] = useMarkStudentDayMutation();
  const { push } = useToast();
  // The register is cut into pages here (the sheet is read once for the whole class, so a page asks the server nothing).
  const [pageNo, setPageNo] = useState(1);
  const limit = STUDENT_PAGE_SIZES[0];
  // The classes that have not taken today's attendance (a warning above the list; a failed read leaves it out). Not asked while a year
  // that is over is open: today is not in it.
  const looking = useAppSelector((state) => state.yearView.yearId !== null);
  const pending = useGetStudentsTodayQuery(undefined, { skip: looking || !!unit }).data?.data.pending ?? [];

  function change(patch: Record<string, string>) {
    // Another class, section or range is another list: start on its first page.
    setPageNo(1);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value === "") next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true }
    );
  }

  // A click on a cell opens the two answers for that child and day.
  function openMenu(cell: HTMLElement, student: StudentRangeRow, day: RegisterDay, current: Answer | null) {
    anchor.current = cell;
    setMenu({ student, day, current });
  }
  async function pick(answer: Answer) {
    const chosen = menu;
    setMenu(null);
    // Already that answer (a late child is there): nothing to save.
    if (!chosen || chosen.current === answer) return;
    try {
      await markDay({ studentId: chosen.student.id, date: chosen.day.date, status: answer }).unwrap();
    } catch (err) {
      push("error", getApiError(err)?.message ?? "Could not save the attendance");
    }
  }

  if (structure.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!unit && !picked) return <Card className="px-5 py-10 text-center text-sm text-foreground-muted">No class yet</Card>;

  const days = data ? dayCount(data.from, data.to) : 0;
  const grid = showsEveryDay(days);
  // A week or less is read like a register: bigger marks, and the reasons beside each child.
  const register = grid && isWeekRange(days);
  // The columns: the days the server sent, and for a week the days after today up to Saturday, as days that have not come.
  const columns: RegisterDay[] = data ? (register ? weekColumns(data.days, range, data.to) : data.days) : [];
  const students = data?.students ?? [];
  const totalPages = Math.max(1, Math.ceil(students.length / limit));
  const current = Math.min(pageNo, totalPages);
  const shown = students.slice((current - 1) * limit, current * limit);
  // Counts only mean something once attendance was taken on at least one of the days; before that every number would be a 0 that says nothing.
  const taken = data ? data.days.some((d) => d.taken) : false;
  const sum = data?.summary;
  const thereDays = sum ? sum.present + sum.late : 0;
  const notThereDays = sum ? sum.absent + sum.leave : 0;

  return (
    <div className="space-y-5">
      {!unit && pending.length > 0 && <NotTakenStrip pending={pending} onPick={(p) => change({ class: p.classId, section: p.sectionId ?? "", from: today, to: today })} />}
      {/* The class, the section and the days: one card, with the way to take attendance at the end of the last row. */}
      <section aria-label="Filters" className="space-y-3 rounded-[var(--radius-card)] border border-border bg-surface px-4 py-3.5 shadow-card">
        <h2 className="text-[15px] font-bold text-foreground">Filters</h2>
        {/* ONE row of choices: a class with one section is "Class 1"; a class with two or more is "Class 5A", "Class 5B". No Section row. */}
        {picked && (
          <FilterRow label="Class">
            <Chips
              label="Class"
              value={picked.key}
              options={units.map((u) => ({ value: u.key, label: u.label }))}
              onChange={(key) => {
                const chosen = units.find((u) => u.key === key);
                if (chosen) change({ class: chosen.classId, section: chosen.sectionId ?? "" });
              }}
            />
          </FilterRow>
        )}
        {/* The days: one box with arrows and the window "Select date range" (the whole app's date filter), not two date boxes and a row of buttons. */}
        <FilterRow label="Date Range" tall>
          <DateRangeControl range={range} noFuture onChange={(r) => change({ from: r.from, to: r.to })} />
        </FilterRow>
      </section>

      {res.isFetching && !data ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !data ? (
        <Card className="px-5 py-10 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the attendance."}</Card>
      ) : (
        <>
          <section aria-label="About the attendance" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Total Students" value={data.summary.students} icon={Backpack} tone="primary" />
            <StatTile label="Present" value={taken ? thereDays : null} icon={CalendarCheck2} tone="success" />
            <StatTile label="Absent" value={taken ? notThereDays : null} icon={CalendarX2} tone="danger" />
            <StatTile label="Attendance Rate" value={taken ? percentText(data.summary.percent) : null} icon={Percent} tone="info" />
          </section>

          {data.students.length === 0 ? (
            <Card className="px-5 py-10 text-center text-sm text-foreground-muted">No student in this class yet</Card>
          ) : (
            // One card: the register, and its pages at the foot of it (the reference's).
            <section aria-label="Attendance register" className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
              <div className="overflow-x-auto">
                <table aria-label={`Attendance of ${data.label}`} className="w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th scope="col" className={TH}>
                        Roll
                      </th>
                      <th scope="col" className={TH}>
                        Student Name
                      </th>
                      <th scope="col" className={TH}>
                        Admission No.
                      </th>
                      {grid &&
                        columns.map((d, at) => {
                          const heading = (
                            <>
                              <span className="block">{register ? WEEKDAY_NAME[d.weekday] : weekdayLetter(d.weekday)}</span>
                              <span className="block">{d.date.slice(8)}</span>
                            </>
                          );
                          return (
                            <th
                              key={d.date}
                              scope="col"
                              aria-label={`${WEEKDAY_NAME[d.weekday]} ${shortDay(d.date)}${d.coming ? ", coming" : d.holiday ? `, Holiday: ${d.holiday}` : !d.taken ? ", attendance not taken" : ""}`}
                              aria-current={d.date === today ? "date" : undefined}
                              title={d.coming ? undefined : d.holiday ? `Holiday: ${d.holiday}` : d.taken ? undefined : "Attendance not taken"}
                              className={cn(
                                "border-b text-center font-semibold leading-tight text-foreground-muted",
                                register ? "min-w-20 px-2 py-2 text-xs" : "px-1 py-2 text-[11px]",
                                // A faint line between the days.
                                at > 0 && "border-l border-l-surface-muted!",
                                // Today's column is outlined, with round corners, from its heading to its last mark: the eye finds the day.
                                d.date === today && "rounded-t-xl border-x-2 border-t-2 border-x-primary/60! border-t-primary/60! bg-primary-soft text-primary-deep",
                                d.holiday && "bg-info-soft text-info",
                                !d.taken && !d.holiday && !d.coming && "opacity-50"
                              )}
                            >
                              {d.taken ? (
                                // A day attendance was taken opens in two sides, Present and Absent.
                                <button
                                  type="button"
                                  aria-label={`Present and absent on ${WEEKDAY_NAME[d.weekday]} ${shortDay(d.date)}`}
                                  onClick={() => setSplitDay(d)}
                                  className="w-full rounded-lg px-1 py-0.5 font-semibold leading-tight transition-colors hover:bg-primary-soft hover:text-primary-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
                                >
                                  {heading}
                                </button>
                              ) : (
                                heading
                              )}
                            </th>
                          );
                        })}
                      {taken && (
                        <>
                          <th scope="col" className={THC}>
                            Present
                          </th>
                          <th scope="col" className={THC}>
                            Absent
                          </th>
                          <th scope="col" className={THC}>
                            %
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((s, i) => {
                      const byDay = new Map(s.records.map((r) => [r.date, r]));
                      const last = i === shown.length - 1;
                      // A line under every row but the last (the pages have their own line).
                      const rule = last ? "" : "border-b";
                      // Days there (late is there) and days not there (leave is not); nothing marked for the child is a dash, not a 0.
                      const marked = s.tally.days > 0;
                      const there = s.tally.present + s.tally.late;
                      const away = s.tally.absent + s.tally.leave;
                      return (
                        <tr key={s.id} className="hover:bg-background">
                          {/* A child the school has given no roll number is numbered by the place in the list. */}
                          <td className={cn("px-3 py-1.5 text-foreground", rule)}>{s.rollNumber ?? (current - 1) * limit + i + 1}</td>
                          <td className={cn("whitespace-nowrap px-3 py-1.5", rule)}>
                            <button type="button" onClick={() => setOpen(s)} className="max-w-[14rem] truncate text-left font-semibold text-foreground hover:text-primary-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
                              {s.name}
                            </button>
                          </td>
                          <td className={cn("whitespace-nowrap px-3 py-1.5 text-foreground", rule)}>{s.admissionNumber}</td>
                          {grid &&
                            columns.map((d, at) => {
                              const r = byDay.get(d.date);
                              const line = cn(rule, at > 0 && "border-l border-l-surface-muted!");
                              const todayTint = d.date === today && cn("border-x-2 border-x-primary/60! bg-primary-soft/40", last && "rounded-b-xl border-b-2 border-b-primary/60!");
                              // A day this child can be marked on: in a week's register, up to today, not a holiday, not a Sunday.
                              const markable = register && !d.coming && d.date <= today && !d.holiday && d.weekday !== 7;
                              if (!r) {
                                if (!markable) return <td key={d.date} className={cn("px-1 py-1.5 text-center text-foreground-muted/40", line, todayTint, d.holiday && "bg-info-soft/40")} />;
                                // Nobody has said yet: it says so, and (for the people who may mark) a click says Present or Absent.
                                return (
                                  <td key={d.date} className={cn("px-1 py-1.5 text-center", line, todayTint)}>
                                    {canTake ? (
                                      <button
                                        type="button"
                                        aria-label={`${s.name}, ${shortDay(d.date)}: not taken`}
                                        title="Mark present or absent"
                                        onClick={(e) => openMenu(e.currentTarget, s, d, null)}
                                        className="cursor-pointer whitespace-nowrap rounded-md px-1.5 py-1 text-[11px] font-medium text-foreground-muted transition-colors hover:bg-primary-soft hover:text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                                      >
                                        Not taken
                                      </button>
                                    ) : (
                                      <span className="whitespace-nowrap text-[11px] font-medium text-foreground-muted">Not taken</span>
                                    )}
                                  </td>
                                );
                              }
                              const m = MARK[r.status];
                              // The true word and the reason are in the hover; what is drawn is P (came) or A (did not).
                              const said = `${s.name}, ${shortDay(d.date)}: ${m.word}${r.reason ? `, ${r.reason}` : ""}`;
                              const shownMark = cameToSchool(r.status) ? MARK.present : MARK.absent;
                              return (
                                <td key={d.date} className={cn("px-1 py-1.5 text-center", line, todayTint)}>
                                  {canTake && markable ? (
                                    // The mark can be changed: a click opens Present and Absent.
                                    <button
                                      type="button"
                                      aria-label={said}
                                      title={said}
                                      onClick={(e) => openMenu(e.currentTarget, s, d, cameToSchool(r.status) ? "present" : "absent")}
                                      className={cn("inline-flex size-7 cursor-pointer items-center justify-center rounded-full text-xs font-semibold transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30", shownMark.strong)}
                                    >
                                      {shownMark.letter}
                                    </button>
                                  ) : (
                                    <span
                                      aria-label={said}
                                      title={said}
                                      className={cn("inline-flex items-center justify-center font-semibold", register ? "size-7 rounded-full text-xs" : "h-6 min-w-6 rounded-md px-0.5 text-[11px]", register ? shownMark.strong : shownMark.tone)}
                                    >
                                      {shownMark.letter}
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          {taken && (
                            <>
                              <td aria-label={marked ? `Present: ${there}` : "Present: none marked"} className={cn("px-3 py-1.5 text-center font-semibold", marked ? "text-success" : "text-foreground-muted", rule)}>
                                {marked ? there : "–"}
                              </td>
                              <td aria-label={marked ? `Absent: ${away}` : "Absent: none marked"} className={cn("px-3 py-1.5 text-center font-semibold", marked ? "text-danger" : "text-foreground-muted", rule)}>
                                {marked ? away : "–"}
                              </td>
                              <td
                                aria-label="Percentage"
                                title={isLowPercent(s.tally.percent) ? "Below 75%" : undefined}
                                className={cn("px-3 py-1.5 text-center font-semibold", isLowPercent(s.tally.percent) ? "text-danger" : marked ? "text-foreground" : "text-foreground-muted", rule)}
                              >
                                {percentText(s.tally.percent)}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!taken && <p className="border-t px-4 py-3 text-center text-sm text-foreground-muted">Attendance has not been taken for these days yet</p>}
              <div className="border-t px-4 py-3">
                <StudentPager page={{ page: current, limit, total: students.length, totalPages, items: shown }} limit={limit} onPage={setPageNo} compact />
              </div>
            </section>
          )}
        </>
      )}
      {open && data && <StudentDaysDialog student={open} range={{ from: data.from, to: data.to }} onClose={() => setOpen(null)} />}
      {menu && <MarkMenu anchor={anchor} title={`${menu.student.name}, ${WEEKDAY_NAME[menu.day.weekday]} ${shortDay(menu.day.date)}`} current={menu.current} onPick={pick} onClose={() => setMenu(null)} />}
      {splitDay && data && <DaySplitDialog date={splitDay.date} weekday={splitDay.weekday} label={data.label} students={data.students} onClose={() => setSplitDay(null)} />}
    </div>
  );
}
