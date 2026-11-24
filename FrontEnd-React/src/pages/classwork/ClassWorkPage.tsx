import { useParams, useSearchParams } from "react-router";
import { BookOpenText, CalendarCheck2, ClipboardList, GraduationCap } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useCan } from "../../hooks/useCan";
import { useGetMyClassesQuery } from "../../redux/api/classroomApi";
import { useGetClassOverviewQuery } from "../../redux/api/studentsApi";
import { StudentAttendance } from "../../components/attendance/StudentAttendance";
import { AttendancePanel } from "../../components/classwork/AttendancePanel";
import { DiaryPanel } from "../../components/classwork/DiaryPanel";
import { ExamsPanel } from "../../components/classwork/ExamsPanel";
import { TestsPanel } from "../../components/classwork/TestsPanel";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { Card } from "../../components/ui/Card";
import { PageTabs, type PageTab } from "../../components/ui/PageTabs";
import { TabPanel } from "../../components/ui/TabPanel";
import { Skeleton } from "../../components/ui/Skeleton";

type Tab = "attendance" | "diary" | "tests" | "exams";

/**
 * A class's work (`/class-work/:classId?section=&tab=`, docs/parent-teacher-flow.md): for a teacher, one of their classes (from their
 * home); for the people who run the school, any class (from School Class). Four tabs: **Attendance** (the class teacher takes it, the school looks),
 * **Diary** (what was taught, the homework), **Tests** (with their marks) and **Exams** (the school's exams for this class, and their
 * marks). A teacher who is not the class teacher opens on the Diary.
 */
export default function ClassWorkPage() {
  const { classId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const sectionId = params.get("section");
  const { user } = useAuth();
  const can = useCan();
  // Works on every class (the people who run the school, and staff the school allowed to take attendance); a teacher on their own classes.
  const runsSchool = !!user && user.role !== "teacher" && user.role !== "parent" && user.role !== "student" && user.role !== "super_admin";
  const mine = useGetMyClassesQuery(undefined, { skip: runsSchool });
  const overview = useGetClassOverviewQuery({ classId }, { skip: !runsSchool });
  const myClass = mine.data?.data.items.find((c) => c.classId === classId && (c.sectionId ?? null) === (sectionId ?? null));
  const klass = overview.data?.data.classes[0];
  const section = klass?.sections.find((s) => s.id === sectionId);
  const label = myClass?.label ?? (klass ? (section ? `${klass.name} - ${section.name}` : klass.name) : "Class work");
  // Only the class teacher TAKES attendance (2026-11-17); the school sees it. A teacher who is not the class teacher has no Attendance tab.
  const isClassTeacher = !!myClass?.isClassTeacher;
  const takesAttendance = runsSchool || isClassTeacher;
  // The subjects a test may be added for: the teacher's own (every one for the class teacher and the school: the server says which).
  const testSubjects = myClass?.subjects ?? [];
  // Each tab is what the school allowed this person (Permissions): the people who run the school have them all.
  const tabs: PageTab<Tab>[] = [
    ...(takesAttendance && can("attendance.view") ? [{ id: "attendance" as const, label: "Attendance", icon: CalendarCheck2 }] : []),
    ...(can("classwork.view") ? [{ id: "diary" as const, label: "Diary", icon: BookOpenText }, { id: "tests" as const, label: "Tests", icon: ClipboardList }] : []),
    ...(can("exams.view") ? [{ id: "exams" as const, label: "Exams", icon: GraduationCap }] : []),
  ];
  const asked = params.get("tab") as Tab | null;
  const tab: Tab | undefined = asked && tabs.some((t) => t.id === asked) ? asked : tabs[0]?.id;

  if (!runsSchool && mine.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (tabs.length === 0) {
    return (
      <div className="space-y-6">
        <StudentFormHeader title={label} crumbs={[{ label: "Dashboard", to: "/dashboard" }]} />
        <Card className="px-5 py-10 text-center text-sm text-foreground-muted">You are not allowed to open the work of a class. Ask the school.</Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StudentFormHeader title={label} crumbs={[{ label: "Dashboard", to: "/dashboard" }]} />
      <PageTabs
        label="Class work"
        tabs={tabs}
        value={tab ?? tabs[0].id}
        onChange={(next) =>
          setParams(
            (prev) => {
              const params = new URLSearchParams(prev);
              params.set("tab", next);
              return params;
            },
            { replace: true }
          )
        }
      />
      <TabPanel tab={tab ?? tabs[0].id} role="tabpanel" aria-label={tabs.find((t) => t.id === tab)?.label}>
        {tab === "attendance" && (
          <div className="space-y-8">
            {/* The class teacher's week: Not taken, and a click on a cell marks one child on one day. */}
            {isClassTeacher && <StudentAttendance unit={{ classId, sectionId }} canMark />}
            {/* The whole day in one Save (the class teacher), or only to look at (the school). */}
            <AttendancePanel classId={classId} sectionId={sectionId} canMark={isClassTeacher} />
          </div>
        )}
        {tab === "diary" && <DiaryPanel classId={classId} sectionId={sectionId} />}
        {tab === "tests" && <TestsPanel classId={classId} sectionId={sectionId} subjects={testSubjects} />}
        {tab === "exams" && <ExamsPanel classId={classId} sectionId={sectionId} />}
      </TabPanel>
    </div>
  );
}
