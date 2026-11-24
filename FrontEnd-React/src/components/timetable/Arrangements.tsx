import { useState } from "react";
import { useSearchParams } from "react-router";
import { ArrowLeftRight, CalendarOff, Check, ClipboardCheck, Clock3, MailCheck, PartyPopper, UserRoundCheck, UserRoundX } from "lucide-react";
import { useGetStaffLeavesQuery } from "../../redux/api/attendanceApi";
import { useGetArrangementQuery, useHandBackPeriodMutation, useSaveArrangementMutation, useSaveAttendanceCoverMutation } from "../../redux/api/timetableApi";
import { getApiError } from "../../utils/apiErrors";
import { addDays, shortDay } from "../../utils/calendar";
import { todayInIndia } from "../../utils/students";
import type { ArrangementAttendance, ArrangementDay, ArrangementLesson, AwayStatus, FreeTeacher } from "../../types";
import { StaffLeaveRequests } from "../leaves/StaffLeaveRequests";
import { StudentFormHeader } from "../students/StudentFormHeader";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { DayStepper } from "../ui/DayStepper";
import { Field } from "../ui/Field";
import { PageTabs } from "../ui/PageTabs";
import { TabPanel } from "../ui/TabPanel";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/toast-context";

type Tab = "away" | "not_in";
type View = "arrangements" | "leave";

/** How many days ahead the arrangement can be looked at and made (a leave is at most 60 days long, asked for from today). */
const DAYS_AHEAD = 60;

const STATUS: Record<AwayStatus, { label: string; tone: "danger" | "warning" | "neutral" | "success" }> = {
  arrived: { label: "Arrived", tone: "success" },
  absent: { label: "Absent", tone: "danger" },
  leave: { label: "On leave", tone: "warning" },
  not_in: { label: "Not checked in", tone: "neutral" },
};

/** "Asha Rao · 1 period today · not in yet": a free teacher in the list, with what helps to choose. */
function freeLabel(t: FreeTeacher): string {
  const parts = [t.name, `${t.today} ${t.today === 1 ? "period" : "periods"} today`];
  if (!t.in) parts.push("not in yet");
  if (t.full) parts.push("full");
  return parts.join(" · ");
}

/**
 * Leave & arrangements (`/school/arrangements`, 2026-11-24, user: "teacher aur staff ki leave yahin aaye, naam related rakho, aur Timetable ke nested
 * tabs se bahar sidebar mein rakho"): one page of the teachers' and the staff's days away, in two tabs. **Arrangements** is who is away on a day and
 * who takes their periods; **Leave requests** is what the teachers and the staff sent from their own login (reason, days, status), answered here.
 * The tab is in the address (`?view=leave`: the bell's link opens it), and the waiting count sits on the tab.
 */
export function Arrangements() {
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "leave" ? "leave" : "arrangements";
  // The same question as the Leave requests tab's first look (Waiting, everyone): asked once, the tab opens from it.
  const waiting = useGetStaffLeavesQuery({ status: "pending", who: "all" });

  const changeView = (next: View) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === "leave") p.set("view", "leave");
      else p.delete("view");
      return p;
    });

  return (
    <div className="space-y-5">
      <StudentFormHeader title="Leave & arrangements" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} />

      <PageTabs
        variant="card"
        label="Leave and arrangements"
        value={view}
        onChange={changeView}
        tabs={[
          { id: "arrangements", label: "Arrangements", icon: ArrowLeftRight },
          { id: "leave", label: "Leave requests", icon: MailCheck, count: waiting.currentData?.data.waiting },
        ]}
      />

      <TabPanel tab={view}>{view === "leave" ? <StaffLeaveRequests /> : <ArrangementDays />}</TabPanel>
    </div>
  );
}

/**
 * The Arrangements tab (2026-11-22, user: "teacher absent ho to arrangement: alag tab mein kaun nahi aaya, fir kaun kaun se teacher free hain, to
 * us period mein us teacher ko assign kar paye"). One day (today to begin with; the arrows go back to see an earlier day, and ahead to a day of an approved
 * leave): the teachers marked Absent or On leave (one tab) and, today, the ones with periods who have not checked in yet (another tab). Each teacher's
 * periods of the day, and for each a list of the teachers free then (the ones with the fewest periods first) and **Assign**: the teacher put in is told.
 * Today and the days to come can be changed; a day that is over is only read.
 */
function ArrangementDays() {
  const today = todayInIndia();
  const lastDay = addDays(today, DAYS_AHEAD);
  const [params, setParams] = useSearchParams();
  const date = params.get("date") && params.get("date")! <= lastDay ? params.get("date")! : today;
  const tab: Tab = params.get("tab") === "not_in" ? "not_in" : "away";
  const res = useGetArrangementQuery(date);
  const day = res.currentData?.data;

  const change = (next: { date?: string; tab?: Tab }) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next.date !== undefined) {
        if (next.date === today) p.delete("date");
        else p.set("date", next.date);
      }
      if (next.tab !== undefined) {
        if (next.tab === "away") p.delete("tab");
        else p.set("tab", next.tab);
      }
      return p;
    });

  const away = day?.away.filter((a) => a.status !== "not_in") ?? [];
  const notIn = day?.away.filter((a) => a.status === "not_in") ?? [];
  const shown = tab === "away" ? away : notIn;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Field id="arrangement-date" label="Date" quiet hideLabel className="w-full sm:w-auto">
          <DayStepper id="arrangement-date" label="Date" value={date} max={lastDay} onChange={(d) => change({ date: d })} jump={{ label: "Today", value: today }} />
        </Field>
        {day && !day.holiday && <CoverCount day={day} />}
      </div>

      <PageTabs
        label="Which teachers to show"
        value={tab}
        onChange={(t) => change({ tab: t })}
        tabs={[
          { id: "away", label: "Absent & on leave", count: day ? away.length : undefined },
          ...(day?.today ? [{ id: "not_in" as const, label: "Not checked in", count: notIn.length }] : []),
        ]}
      />

      <TabPanel tab={tab}>
      {res.error && !day ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the day."}</p>
          <Button variant="outline" onClick={() => res.refetch()}>
            Try again
          </Button>
        </Card>
      ) : !day ? (
        <div className="space-y-3">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : day.holiday ? (
        <Notice icon={CalendarOff} text={`No school: ${day.holiday}`} />
      ) : shown.length === 0 ? (
        <Notice icon={PartyPopper} text={tab === "away" ? "No teacher is absent or on leave" : "Every teacher with periods has checked in"} />
      ) : (
        <ul aria-label={tab === "away" ? "Absent and on leave" : "Not checked in"} className="space-y-4">
          {shown.map((a) => (
            <li key={a.teacher.id}>
              <Card role="region" aria-label={a.teacher.name} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span aria-hidden className={a.status === "arrived" ? "flex size-9 items-center justify-center rounded-full bg-success-soft text-success" : "flex size-9 items-center justify-center rounded-full bg-danger-soft text-danger"}>
                      {a.status === "arrived" ? <UserRoundCheck className="size-4.5" /> : <UserRoundX className="size-4.5" />}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-foreground">{a.teacher.name}</p>
                      <p className="text-xs text-foreground-muted">
                        {a.status === "arrived"
                          ? "Came after a substitute was put in"
                          : a.lessons.length === 0
                            ? "No periods this day"
                            : `${a.lessons.filter((l) => l.substitute).length} of ${a.lessons.length} ${a.lessons.length === 1 ? "period" : "periods"} arranged`}
                      </p>
                    </div>
                  </div>
                  <Badge tone={STATUS[a.status].tone}>{a.status === "arrived" && a.arrivedAt ? `Arrived ${a.arrivedAt}` : STATUS[a.status].label}</Badge>
                </div>
                {a.lessons.length > 0 && (
                  <ul aria-label={`Periods of ${a.teacher.name}`} className="divide-y divide-border/70">
                    {a.lessons.map((l) => (
                      <LessonRow key={`${l.classId}:${l.sectionId}:${l.period}`} date={day.date} canChange={day.editable && a.status !== "arrived"} absentId={a.teacher.id} absentName={a.teacher.name} lesson={l} />
                    ))}
                  </ul>
                )}
                {/* A class teacher's class has its student attendance to give to someone else that day (2026-11-24). */}
                {(a.attendance ?? []).length > 0 && (
                  <ul aria-label={`Student attendance of ${a.teacher.name}`} className="divide-y divide-border/70 border-t border-border bg-surface-muted/40">
                    {(a.attendance ?? []).map((u) => (
                      <AttendanceRow key={`${u.classId}:${u.sectionId}`} date={day.date} canChange={day.editable} absentId={a.teacher.id} unit={u} />
                    ))}
                  </ul>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      </TabPanel>
    </div>
  );
}

/** "3 of 5 periods arranged": over every away teacher of the day. */
function CoverCount({ day }: { day: ArrangementDay }) {
  const lessons = day.away.flatMap((a) => a.lessons);
  if (lessons.length === 0) return null;
  const done = lessons.filter((l) => l.substitute).length;
  return (
    <p role="status" aria-label="Periods arranged" className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary-deep ring-1 ring-inset ring-primary/20">
      {done} of {lessons.length} {lessons.length === 1 ? "period" : "periods"} arranged
    </p>
  );
}

function Notice({ icon: Icon, text }: { icon: typeof CalendarOff; text: string }) {
  return (
    <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <Icon className="size-6" aria-hidden />
      </span>
      <p className="text-sm font-semibold text-foreground">{text}</p>
    </Card>
  );
}

/**
 * One period of an away teacher: when, which class and subject, and who takes it. Today or a day to come: a list of the free teachers and **Assign** (a
 * teacher already put in shows with **Change** and **Remove**). A day that is over: only who took it.
 */
function LessonRow({ date, canChange, absentId, absentName, lesson }: { date: string; canChange: boolean; absentId: string; absentName: string; lesson: ArrangementLesson }) {
  const { push } = useToast();
  const [save, { isLoading }] = useSaveArrangementMutation();
  const [handBack, { isLoading: handingBack }] = useHandBackPeriodMutation();
  const [choosing, setChoosing] = useState(false);
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const name = `${lesson.label}, Period ${lesson.period}`;

  async function send(substituteTeacherId: string | null) {
    setError(null);
    try {
      await save({ date, classId: lesson.classId, sectionId: lesson.sectionId, period: lesson.period, absentTeacherId: absentId, substituteTeacherId }).unwrap();
      push("success", substituteTeacherId ? `${lesson.free.find((t) => t.id === substituteTeacherId)?.name ?? "The teacher"} takes ${name}` : `${name}: substitute taken off`);
      setChoosing(false);
      setChoice("");
    } catch (err) {
      setError(getApiError(err)?.message ?? "Could not save. Please try again.");
    }
  }

  /** The teacher who was away has come while the substitute is taking the period, and takes the rest of it: the substitute is free from now. */
  async function takeRest() {
    setError(null);
    try {
      await handBack({ date, classId: lesson.classId, sectionId: lesson.sectionId, period: lesson.period, absentTeacherId: absentId }).unwrap();
      push("success", `${absentName} takes the rest of ${name}`);
    } catch (err) {
      setError(getApiError(err)?.message ?? "Could not save. Please try again.");
    }
  }

  const picking = canChange && (!lesson.substitute || choosing);
  const taken = lesson.taken ?? [];
  return (
    <li aria-label={name} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="flex min-w-[9rem] items-center gap-2">
        <span className="rounded-lg bg-primary-soft px-2 py-1 text-xs font-bold text-primary-deep">P{lesson.period}</span>
        <span className="flex items-center gap-1 text-xs font-medium tabular-nums text-foreground-muted">
          <Clock3 className="size-3.5" aria-hidden />
          {lesson.start}–{lesson.end}
        </span>
      </div>
      <div className="min-w-[10rem] flex-1">
        <p className="text-sm font-semibold text-foreground">{lesson.label}</p>
        <p className="text-xs text-foreground-muted">{lesson.subjectName}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {lesson.substitute && !choosing && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success ring-1 ring-inset ring-success/30">
            <Check className="size-3.5" aria-hidden />
            {lesson.substitute.name}
          </span>
        )}
        {taken.length > 0 && <span className="text-xs font-semibold text-foreground-muted">{taken.map((t) => `${t.name} ${t.minutes} min`).join(" · ")}</span>}
        {lesson.canTakeBack && (
          <Button size="sm" variant="outline" onClick={() => void takeRest()} disabled={handingBack}>
            {absentName} takes the rest
          </Button>
        )}
        {!canChange && !lesson.substitute && <span className="text-xs text-foreground-muted">No one was put in</span>}
        {canChange && lesson.substitute && !choosing && (
          <>
            <Button size="sm" variant="outline" onClick={() => setChoosing(true)} disabled={isLoading}>
              Change
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void send(null)} disabled={isLoading}>
              Remove
            </Button>
          </>
        )}
        {picking &&
          (lesson.free.length === 0 ? (
            <span className="text-xs font-medium text-warning">No teacher is free then</span>
          ) : (
            <>
              <Select
                aria-label={`Free teacher for ${name}`}
                className="w-64"
                placeholder="Choose a free teacher"
                value={choice}
                onChange={setChoice}
                options={lesson.free.map((t) => ({ value: t.id, label: freeLabel(t) }))}
              />
              <Button size="sm" onClick={() => void send(choice)} disabled={!choice || isLoading}>
                Assign
              </Button>
              {choosing && (
                <Button size="sm" variant="ghost" onClick={() => setChoosing(false)} disabled={isLoading}>
                  Cancel
                </Button>
              )}
            </>
          ))}
      </div>
      {error && (
        <p role="alert" className="basis-full text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * The student attendance of a class whose class teacher is away (2026-11-24, user: "class teacher absent ho to attendance kisi aur teacher ko assign kar do jo
 * pehla period le"): who takes it that day, or a list of the teachers who take a period of that class that day (the earliest period first) and **Assign**;
 * once given it shows with **Change** and **Remove**. The teacher chosen takes that class's attendance on that day, and when the class teacher is on a leave of
 * several days (2026-11-24: "jab tak leave par hai") on every day of it, from this day to its last ("Class teacher is on leave till 26 Nov", "Dev Patel · till 26 Nov");
 * Change and Remove act from this day on. The teacher is told.
 */
function AttendanceRow({ date, canChange, absentId, unit }: { date: string; canChange: boolean; absentId: string; unit: ArrangementAttendance }) {
  const { push } = useToast();
  const [save, { isLoading }] = useSaveAttendanceCoverMutation();
  const [choosing, setChoosing] = useState(false);
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function send(coverTeacherId: string | null) {
    setError(null);
    try {
      await save({ date, classId: unit.classId, sectionId: unit.sectionId, absentTeacherId: absentId, coverTeacherId }).unwrap();
      push(
        "success",
        coverTeacherId
          ? `${unit.options.find((o) => o.id === coverTeacherId)?.name ?? "The teacher"} takes the attendance of ${unit.label}${unit.leaveUntil ? ` till ${shortDay(unit.leaveUntil)}` : ""}`
          : `${unit.label}: attendance taken off`
      );
      setChoosing(false);
      setChoice("");
    } catch (err) {
      setError(getApiError(err)?.message ?? "Could not save. Please try again.");
    }
  }

  const picking = canChange && (!unit.cover || choosing);
  return (
    <li aria-label={`Attendance of ${unit.label}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="flex min-w-[9rem] items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary-soft text-primary-deep">
          <ClipboardCheck className="size-4" aria-hidden />
        </span>
        <span className="text-xs font-bold text-foreground">Student attendance</span>
      </div>
      <div className="min-w-[10rem] flex-1">
        <p className="text-sm font-semibold text-foreground">{unit.label}</p>
        <p className="text-xs text-foreground-muted">{unit.leaveUntil ? `Class teacher is on leave till ${shortDay(unit.leaveUntil)}` : "Class teacher is away"}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {unit.cover && !choosing && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success ring-1 ring-inset ring-success/30">
            <Check className="size-3.5" aria-hidden />
            {unit.cover.name}
            {unit.cover.until && <span className="font-semibold opacity-80">· till {shortDay(unit.cover.until)}</span>}
          </span>
        )}
        {!canChange && !unit.cover && <span className="text-xs text-foreground-muted">No one was given it</span>}
        {canChange && unit.cover && !choosing && (
          <>
            <Button size="sm" variant="outline" onClick={() => setChoosing(true)} disabled={isLoading}>
              Change
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void send(null)} disabled={isLoading}>
              Remove
            </Button>
          </>
        )}
        {picking &&
          (unit.options.length === 0 ? (
            <span className="text-xs font-medium text-warning">No other teacher has a period in this class that day</span>
          ) : (
            <>
              <Select
                aria-label={`Teacher for the attendance of ${unit.label}`}
                className="w-64"
                placeholder="Choose a teacher"
                value={choice}
                onChange={setChoice}
                options={unit.options.map((o) => ({ value: o.id, label: `${o.name} · Period ${o.period}` }))}
              />
              <Button size="sm" onClick={() => void send(choice)} disabled={!choice || isLoading}>
                Assign
              </Button>
              {choosing && (
                <Button size="sm" variant="ghost" onClick={() => setChoosing(false)} disabled={isLoading}>
                  Cancel
                </Button>
              )}
            </>
          ))}
      </div>
      {error && (
        <p role="alert" className="basis-full text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </li>
  );
}
