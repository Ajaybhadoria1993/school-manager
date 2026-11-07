import { useSearchParams } from "react-router";
import { Backpack, UserRoundCog, UsersRound } from "lucide-react";
import { cn } from "../../utils/helpers";
import { StudentAttendanceTab } from "../../components/attendance/StudentAttendanceTab";
import { TeacherAttendanceTab } from "../../components/attendance/TeacherAttendanceTab";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { Card } from "../../components/ui/Card";

type Tab = "student" | "teacher" | "staff";

const TABS: { value: Tab; label: string; icon: typeof Backpack }[] = [
  { value: "student", label: "Student", icon: Backpack },
  { value: "teacher", label: "Teacher", icon: UsersRound },
  { value: "staff", label: "Staff", icon: UserRoundCog },
];

/**
 * Attendance (the menu entry under Teacher, `/attendance`, 2026-11-06), for the people who run the school: three tabs. **Student**: any
 * class's children for any days (this month to start with), with the reason of an absence. **Teacher**: who came and at what time (a
 * teacher marks themselves present in the app; one who has not by the time school ends is absent). **Staff**: coming. The tab is kept in the
 * address.
 */
export default function AttendancePage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get("tab") as Tab | null;
  const tab: Tab = asked && TABS.some((t) => t.value === asked) ? asked : "student";

  return (
    <div className="space-y-6">
      <StudentFormHeader title="Attendance" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} />
      <div role="tablist" aria-label="Attendance" className="inline-flex flex-wrap gap-1 rounded-xl bg-surface-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            // A tab keeps its own days: leaving one for another starts that one on the page's default.
            onClick={() => setParams({ tab: t.value }, { replace: true })}
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
      <div role="tabpanel" aria-label={TABS.find((t) => t.value === tab)?.label}>
        {tab === "student" && <StudentAttendanceTab />}
        {tab === "teacher" && <TeacherAttendanceTab />}
        {tab === "staff" && <Card className="px-5 py-12 text-center text-sm font-semibold text-foreground-muted">Staff attendance is coming soon</Card>}
      </div>
    </div>
  );
}
