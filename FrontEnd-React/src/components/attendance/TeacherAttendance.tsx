import { useState } from "react";
import { useSearchParams } from "react-router";
import { CalendarX2, ClockAlert, Search, UserRoundCheck, UsersRound } from "lucide-react";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useGetTeachersAttendanceQuery } from "../../redux/api/attendanceApi";
import { useAddressSearch } from "../../hooks/useAddressSearch";
import { useYearView } from "../../hooks/useYearView";
import { getApiError } from "../../utils/apiErrors";
import { todayStartRange } from "../../utils/attendance";
import { shortDay } from "../../utils/calendar";
import { clock12 } from "../../utils/exams";
import { cn } from "../../utils/helpers";
import { todayInIndia } from "../../utils/students";
import type { TeacherSheetRow } from "../../types";
import { StatTile } from "../dashboard/school/StatTile";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { DateRangeControl } from "../ui/DateRangeControl";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { PeopleSheetTable } from "./PeopleSheetTable";
import { TeacherDaysDialog } from "./TeacherDaysDialog";

/** The first row of the Class list: every teacher. */
const ALL = "__all__";

/**
 * Teacher attendance for the school (Attendance > Teacher, 2026-11-06). Nobody takes it: a teacher marks themselves present in the app and the
 * time is kept; one who has not by the time school ends is Absent. ONE line of controls (2026-11-22, asked for: "search bar aur filter, all teacher
 * ya class dalu to usi class ke teacher"): the days (an arrow, a box, an arrow, and the window "Select date range"; it opens on today), the search
 * (the server's, once the typing stops) and the Class (All classes, or a class: its class teachers and the teachers of its subjects). The four
 * counts are of the teachers asked for (the school, or the class), never of the search. The sheet (`PeopleSheetTable`); a teacher's name opens their
 * days with the log, where the school can change one. The sheet reads again by itself when a teacher marks (the live line). The days, the class
 * and the words are kept in the address.
 */
export function TeacherAttendance() {
  const [params, setParams] = useSearchParams();
  const today = todayInIndia();
  const { viewing } = useYearView();
  const start = todayStartRange(today, viewing);
  const range = { from: params.get("from") ?? start.from, to: params.get("to") ?? start.to };
  const classes = useGetStructureQuery().data?.data.classes ?? [];
  const klass = classes.find((c) => c.id === params.get("class"));
  const { text, setText, search } = useAddressSearch();
  const res = useGetTeachersAttendanceQuery({ ...range, classId: klass?.id, search });
  const data = res.data?.data;
  // The window shows the row as the sheet has it now, so a day just changed shows its new word.
  const [openId, setOpenId] = useState<string | null>(null);
  const open: TeacherSheetRow | undefined = data?.teachers.find((t) => t.id === openId);

  function change(patch: Record<string, string>) {
    setParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value) out.set(key, value);
          else out.delete(key);
        }
        return out;
      },
      { replace: true }
    );
  }

  const oneDay = !!data && data.days.length === 1;

  return (
    <div className="space-y-5">
      {/* One line: the days, the search, the class; for one day when school runs. It wraps on a narrow screen. */}
      <div role="search" aria-label="Find teachers" className="flex flex-wrap items-center gap-2.5">
        <DateRangeControl range={range} noFuture onChange={(next) => change({ from: next.from, to: next.to })} />
        <div className="min-w-[14rem] flex-1">
          <Input aria-label="Search the teachers" icon={Search} placeholder="Search teacher" maxLength={60} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <Field id="teacher-class" label="Class" quiet hideLabel className="w-full sm:w-44">
          <Select
            id="teacher-class"
            value={klass?.id ?? ALL}
            onChange={(id) => change({ class: id === ALL ? "" : id })}
            options={[{ value: ALL, label: "All classes" }, ...classes.map((c) => ({ value: c.id, label: c.name }))]}
          />
        </Field>
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
        <div aria-busy={res.isFetching || undefined} className={cn("space-y-5 transition-opacity", res.isFetching && "opacity-70")}>
          <section aria-label="About the teachers' attendance" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Teachers" value={data.summary.teachers} icon={UsersRound} tone="primary" />
            <StatTile label="Present" value={data.summary.present} icon={UserRoundCheck} tone="success" />
            <StatTile label="Late" value={data.summary.late} icon={ClockAlert} tone="warning" />
            <StatTile label="Absent" value={data.summary.absent} icon={CalendarX2} tone="danger" />
          </section>

          {data.teachers.length > 0 ? (
            <PeopleSheetTable rows={data.teachers} days={data.days} from={data.from} to={data.to} person="Teacher" label={oneDay ? "Attendance of the teachers on the day" : "Attendance of the teachers"} onOpen={setOpenId} />
          ) : search ? (
            <Card className="flex flex-col items-center gap-3 px-5 py-10 text-center">
              <p className="text-sm text-foreground-muted">No teacher matches</p>
              <Button variant="outline" size="sm" onClick={() => setText("")}>
                Clear search
              </Button>
            </Card>
          ) : (
            <Card className="px-5 py-10 text-center text-sm text-foreground-muted">{klass ? "No teacher in this class yet" : "No teacher yet"}</Card>
          )}
        </div>
      )}
      {open && <TeacherDaysDialog teacher={open} canChange onClose={() => setOpenId(null)} />}
    </div>
  );
}
