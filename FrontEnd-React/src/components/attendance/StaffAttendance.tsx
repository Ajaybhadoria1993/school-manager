import { useState } from "react";
import { useSearchParams } from "react-router";
import { CalendarOff, CalendarX2, ClockAlert, Search, UserRoundCheck, UsersRound } from "lucide-react";
import { STAFF_ROLES } from "../../constants/staffMembers";
import { useGetStaffAttendanceQuery } from "../../redux/api/attendanceApi";
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

/** The first row of the Department list: every department. */
const ALL = "__all__";
const ROLE_KEYS: readonly string[] = STAFF_ROLES.map((r) => r.key);

/**
 * Staff attendance for the school (Attendance > Staff, 2026-11-22, asked for: "staff me bhi aisa karo, class ka filter mat, department rakho:
 * reception, management, kaam karne wale; admin present, absent, leave sab dekh sake"; then: "staff apne login se present karega, admin nahi
 * lagayenge, bas dekhega"). The people who work for the school without teaching mark themselves present with their own login, on their home (the
 * time is kept; Late after school starts); one who has not by the time school ends is Absent. The school ONLY LOOKS. ONE line of controls: the
 * days, the search (the server's, once the typing stops) and the Department (All departments, or one: the staff member's role, only the
 * departments the school has). The five counts are of the department asked for, never of the search. The sheet (`PeopleSheetTable`, the
 * department under each name); a name opens their days with the log, to read. The days, the department and the words are kept in the address.
 */
export function StaffAttendance() {
  const [params, setParams] = useSearchParams();
  const today = todayInIndia();
  const { viewing } = useYearView();
  const start = todayStartRange(today, viewing);
  const range = { from: params.get("from") ?? start.from, to: params.get("to") ?? start.to };
  // Only a real department of the address is asked for (an old or mistyped one shows every department).
  const asked = params.get("department");
  const department = asked && ROLE_KEYS.includes(asked) ? asked : "";
  const { text, setText, search } = useAddressSearch();
  const res = useGetStaffAttendanceQuery({ ...range, role: department || undefined, search });
  const data = res.data?.data;
  const [openId, setOpenId] = useState<string | null>(null);
  const open: TeacherSheetRow | undefined = data?.staff.find((s) => s.id === openId);

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
      {/* One line: the days, the search, the department; for one day when school runs. It wraps on a narrow screen. */}
      <div role="search" aria-label="Find staff" className="flex flex-wrap items-center gap-2.5">
        <DateRangeControl range={range} noFuture onChange={(next) => change({ from: next.from, to: next.to })} />
        <div className="min-w-[14rem] flex-1">
          <Input aria-label="Search the staff" icon={Search} placeholder="Search staff" maxLength={60} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <Field id="staff-department" label="Department" quiet hideLabel className="w-full sm:w-52">
          <Select
            id="staff-department"
            value={department || ALL}
            onChange={(key) => change({ department: key === ALL ? "" : key })}
            options={[{ value: ALL, label: "All departments" }, ...(data?.departments ?? []).map((d) => ({ value: d.key, label: `${d.label} (${d.count})` }))]}
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
          <section aria-label="About the staff's attendance" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatTile label="Staff" value={data.summary.staff} icon={UsersRound} tone="primary" />
            <StatTile label="Present" value={data.summary.present} icon={UserRoundCheck} tone="success" />
            <StatTile label="Late" value={data.summary.late} icon={ClockAlert} tone="warning" />
            <StatTile label="Absent" value={data.summary.absent} icon={CalendarX2} tone="danger" />
            <StatTile label="On leave" value={data.summary.leave} icon={CalendarOff} tone="navy" />
          </section>

          {data.staff.length > 0 ? (
            <PeopleSheetTable rows={data.staff} days={data.days} from={data.from} to={data.to} person="Staff member" label={oneDay ? "Attendance of the staff on the day" : "Attendance of the staff"} onOpen={setOpenId} />
          ) : search ? (
            <Card className="flex flex-col items-center gap-3 px-5 py-10 text-center">
              <p className="text-sm text-foreground-muted">No staff member matches</p>
              <Button variant="outline" size="sm" onClick={() => setText("")}>
                Clear search
              </Button>
            </Card>
          ) : (
            <Card className="px-5 py-10 text-center text-sm text-foreground-muted">{department ? "No staff member in this department" : "No staff yet"}</Card>
          )}
        </div>
      )}
      {/* To read only: the staff mark their own days with their own login; the school never marks or changes one. */}
      {open && <TeacherDaysDialog teacher={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}
