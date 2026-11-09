import { useParams, useSearchParams } from "react-router";
import { BookOpenText, CalendarCheck2, ClipboardList, GraduationCap } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useGetMyClassesQuery } from "../../redux/api/classroomApi";
import { useGetClassOverviewQuery } from "../../redux/api/studentsApi";
import { cn } from "../../utils/helpers";
import { AttendancePanel } from "../../components/classwork/AttendancePanel";
import { DiaryPanel } from "../../components/classwork/DiaryPanel";
import { ExamsPanel } from "../../components/classwork/ExamsPanel";
import { TestsPanel } from "../../components/classwork/TestsPanel";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { Skeleton } from "../../components/ui/Skeleton";

type Tab = "attendance" | "diary" | "tests" | "exams";

/**
 * A class's work (`/class-work/:classId?section=&tab=`, docs/parent-teacher-flow.md): for a teacher, one of their classes (from their
 * home); for the people who run the school, any class (from School Class). Four tabs: **Attendance** (the class teacher and the school),
 * **Diary** (what was taught, the homework), **Tests** (with their marks) and **Exams** (the school's exams for this class, and their
 * marks). A teacher who is not the class teacher opens on the Diary.
 */
export default function ClassWorkPage() {
  const { classId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const sectionId = params.get("section");
  const { user } = useAuth();
  const runsSchool = user?.role === "school_admin" || user?.role === "principal";
  const mine = useGetMyClassesQuery(undefined, { skip: runsSchool });
  const overview = useGetClassOverviewQuery({ classId }, { skip: !runsSchool });
  const myClass = mine.data?.data.items.find((c) => c.classId === classId && (c.sectionId ?? null) === (sectionId ?? null));
  const klass = overview.data?.data.classes[0];
  const section = klass?.sections.find((s) => s.id === sectionId);
  const label = myClass?.label ?? (klass ? (section ? `${klass.name} - ${section.name}` : klass.name) : "Class work");
  const takesAttendance = runsSchool || !!myClass?.isClassTeacher;
  // The subjects a test may be added for: the teacher's own (every one for the class teacher and the school: the server says which).
  const testSubjects = myClass?.subjects ?? [];
  const tabs: { value: Tab; label: string; icon: typeof CalendarCheck2 }[] = [
    ...(takesAttendance ? [{ value: "attendance" as const, label: "Attendance", icon: CalendarCheck2 }] : []),
    { value: "diary", label: "Diary", icon: BookOpenText },
    { value: "tests", label: "Tests", icon: ClipboardList },
    { value: "exams", label: "Exams", icon: GraduationCap },
  ];
  const asked = params.get("tab") as Tab | null;
  const tab: Tab = asked && tabs.some((t) => t.value === asked) ? asked : tabs[0].value;

  if (!runsSchool && mine.isLoading) return <Skeleton className="h-64 rounded-2xl" />;

  return (
    <div className="space-y-6">
      <StudentFormHeader title={label} crumbs={[{ label: "Dashboard", to: "/dashboard" }]} />
      <div role="tablist" aria-label="Class work" className="inline-flex flex-wrap gap-1 rounded-xl bg-surface-muted p-1">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() =>
              setParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  next.set("tab", t.value);
                  return next;
                },
                { replace: true }
              )
            }
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25",
              tab === t.value ? "bg-primary text-primary-foreground shadow-[0_4px_10px_-2px_rgb(37_99_235/0.45)]" : "text-foreground-muted hover:bg-surface hover:text-foreground"
            )}
          >
            <t.icon className="size-4" aria-hidden />
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={tabs.find((t) => t.value === tab)?.label}>
        {tab === "attendance" && <AttendancePanel classId={classId} sectionId={sectionId} />}
        {tab === "diary" && <DiaryPanel classId={classId} sectionId={sectionId} />}
        {tab === "tests" && <TestsPanel classId={classId} sectionId={sectionId} subjects={testSubjects} />}
        {tab === "exams" && <ExamsPanel classId={classId} sectionId={sectionId} />}
      </div>
    </div>
  );
}
