import { Link, useSearchParams } from "react-router";
import { CalendarRange, Search } from "lucide-react";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useGetStudentsTodayQuery } from "../../redux/api/attendanceApi";
import { useAddressSearch } from "../../hooks/useAddressSearch";
import { useYearView } from "../../hooks/useYearView";
import { useAppSelector } from "../../redux/hooks";
import { cn } from "../../utils/helpers";
import { todayInIndia } from "../../utils/students";
import { Card } from "../ui/Card";
import { DayStepper } from "../ui/DayStepper";
import { Field } from "../ui/Field";
import { Input, controlHeight, useControlStyle } from "../ui/Input";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { NotTakenStrip } from "./NotTakenStrip";
import { StudentDayList } from "./StudentDayList";

/** The first row of the Class and the Section lists: every class, every section of the class. */
const ALL = "__all__";

/**
 * Student attendance for the school (Attendance > Student): ONE day of EVERY class (2026-11-22, asked for: "saari class ke saare students dikhe,
 * class upar, niche bacche; search karun to har class ke bacche aa jayen; filter se ek class"). ONE line of controls, every one the height of a
 * box: the day with a left and a right arrow, the Class (All classes to start with), the Section (a class of two or more sections: All sections
 * or one), the search for a child, and the Register link. Under it `StudentDayList`: each class a card with its children, the summary at the side.
 *
 * The search is the SERVER's: the box waits until the typing stops (300 ms), then the day is asked for again with the words, and only the classes
 * with a child found come back. It stays through the days (one child, day after day) and when a class is picked (that class's children with the
 * words). What is picked is kept in the address (`date`, `class`, `section`, `q`), so an old link to a class still opens that class. The classes
 * that have not taken today's attendance are one strip above the line; a click opens that class for today. The weeks and months of the old register
 * are one click away on their own page (Register).
 */
export function StudentDayAttendance() {
  const [params, setParams] = useSearchParams();
  const structure = useGetStructureQuery();
  const classes = structure.data?.data.classes ?? [];
  const today = todayInIndia();
  const { viewing } = useYearView();
  const height = controlHeight(useControlStyle());
  // A year that is over is open: today is not in it, so the page opens on its last day.
  const start = viewing && viewing.endDate < today ? viewing.endDate : today;
  const date = params.get("date") || start;
  // The class and the section of the address, when they are the school's (an old link to a class that is gone shows every class).
  const klass = classes.find((c) => c.id === params.get("class"));
  const sections = [...(klass?.sections ?? [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  const section = sections.find((s) => s.id === params.get("section"));
  // Who has not taken today's attendance: not asked while a year that is over is open (today is not in it).
  const looking = useAppSelector((state) => state.yearView.yearId !== null);
  const pending = useGetStudentsTodayQuery(undefined, { skip: looking }).data?.data.pending ?? [];

  function change(patch: Record<string, string>) {
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

  // The search box: what is typed shows at once; the words go to the server only after the typing has stopped, and emptying the box is not
  // waited for (everyone is back at once). The address keeps the words that were asked for.
  const { text, setText, search } = useAddressSearch();

  if (structure.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (classes.length === 0) return <Card className="px-5 py-10 text-center text-sm text-foreground-muted">No class yet</Card>;

  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <NotTakenStrip
          pending={pending}
          onPick={(p) => {
            // A class to look at now: its children, without the words of another search.
            setText("");
            change({ class: p.classId, section: p.sectionId ?? "", date: today, q: "" });
          }}
        />
      )}

      {/* One line, every control the height of a box: the day with its arrows, the class, the section, the search, the register. It wraps on a narrow screen. */}
      <div role="search" aria-label="Choose the day and the class" className="flex flex-wrap items-center gap-2.5">
        <Field id="day-date" label="Date" quiet hideLabel className="w-full sm:w-auto">
          <DayStepper
            id="day-date"
            label="Date"
            value={date}
            onChange={(day) => change({ date: day })}
            min={viewing?.startDate}
            max={start}
            // A way home from a long way back (not while a year that is over is open: today is not in it); yesterday is one left arrow.
            jump={viewing ? undefined : { label: "Today", value: today }}
          />
        </Field>
        <Field id="day-class" label="Class" quiet hideLabel className="w-full sm:w-44">
          <Select
            id="day-class"
            value={klass?.id ?? ALL}
            onChange={(id) => change({ class: id === ALL ? "" : id, section: "" })}
            options={[{ value: ALL, label: "All classes" }, ...classes.map((c) => ({ value: c.id, label: c.name }))]}
          />
        </Field>
        {sections.length > 1 && (
          <Field id="day-section" label="Section" quiet hideLabel className="w-full sm:w-36">
            <Select
              id="day-section"
              value={section?.id ?? ALL}
              onChange={(id) => change({ section: id === ALL ? "" : id })}
              options={[{ value: ALL, label: "All sections" }, ...sections.map((s) => ({ value: s.id, label: s.name }))]}
            />
          </Field>
        )}
        <div className="min-w-[14rem] flex-1">
          <Input aria-label="Search the children" icon={Search} placeholder="Search student" maxLength={60} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <Link
          to="/attendance/students/register"
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-primary/30 hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
            height
          )}
        >
          <CalendarRange className="size-4" aria-hidden />
          Register
        </Link>
      </div>

      <StudentDayList date={date} classId={klass?.id ?? ""} sectionId={section?.id ?? ""} search={search} onClearSearch={() => setText("")} />
    </div>
  );
}
