import { Link } from "react-router";
import {
  ArrowRight,
  BadgeIndianRupee,
  BarChart3,
  CalendarCheck,
  CalendarRange,
  GraduationCap,
  Layers,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useSchoolProfile } from "../../hooks/useSchoolProfile";
import { CLASS_LEVELS, MONTHS, formatClassRange } from "../../constants/schoolOptions";
import { MODULES } from "../../constants/modules";
import { STUDENT_WRITERS } from "../../constants/students";
import { TONES } from "../../constants/tones";
import { cn } from "../../utils/helpers";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/Card";
import { StatTile } from "./school/StatTile";
import { SamplePreview } from "./school/SamplePreview";
import { SchoolSummary } from "./school/SchoolSummary";
import { WelcomeHeader } from "./school/WelcomeHeader";
import { AcademicYearBadge, AcademicYearSetUp } from "./school/AcademicYearStatus";

/** How many classes run from the lowest to the highest the school named, or null if it has not said. */
function classCount(lowest: string | null, highest: string | null) {
  const from = CLASS_LEVELS.findIndex((c) => c === lowest);
  const to = CLASS_LEVELS.findIndex((c) => c === highest);
  return from >= 0 && to >= from ? to - from + 1 : null;
}

/**
 * The home page of an approved school, kept plain like the Infinity Medisetu dashboard: a greeting, one status line, flat
 * tiles. The numbers that come from the school's own answers are real; everything that needs a module we have not built yet
 * shows a dash and "Coming soon" instead of an invented number.
 */
export function SchoolDashboard() {
  const { user, tenant } = useAuth();
  const profile = useSchoolProfile();
  if (!user) return null;

  const s1 = profile?.steps[1];
  const classes = s1 ? classCount(s1.lowestClass, s1.highestClass) : null;
  // Students is built for the people who admit them: their shortcuts open it, and it is no longer "up next" for them.
  const managesStudents = STUDENT_WRITERS.includes(user.role);
  const upNext = MODULES.filter((m) =>
    ["attendance", "students", "fees", "hrms"].includes(m.slug) && !(managesStudents && m.slug === "students"),
  );

  return (
    <div className="space-y-6">
      <WelcomeHeader
        firstName={user.name.split(" ")[0]}
        schoolName={tenant?.name ?? "your school"}
        addStudentHref={managesStudents ? "/school/students/new" : undefined}
      />

      <Card className="flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3.5">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
          <span aria-hidden className="size-2.5 rounded-full bg-success" />
          Approved and live
        </span>
        <AcademicYearBadge />
      </Card>

      <AcademicYearSetUp />

      <section aria-label="School at a glance" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Students"
          value={s1?.approxStudents ?? null}
          hint={s1?.approxStudents ? "About, from your registration" : "Student records are coming soon"}
          icon={GraduationCap}
          tone="primary"
          href={managesStudents ? "/school/students" : "/modules/students"}
        />
        <StatTile
          label="Teachers and staff"
          value={null}
          hint="Coming soon"
          icon={UsersRound}
          tone="success"
          href="/modules/hrms"
        />
        <StatTile
          label="Classes"
          value={classes}
          hint={formatClassRange(s1?.lowestClass ?? null, s1?.highestClass ?? null) || "From your registration"}
          icon={Layers}
          tone="info"
          href="/school"
        />
        <StatTile
          label="Administrators"
          value={1}
          hint="You, as the school admin"
          icon={ShieldCheck}
          tone="navy"
          href="/school"
        />
        <StatTile
          label="Present today"
          value={null}
          hint="Coming soon"
          icon={CalendarCheck}
          tone="warning"
          href="/modules/attendance"
        />
        <StatTile
          label="Fees collected"
          value={null}
          hint="Coming soon"
          icon={BadgeIndianRupee}
          tone="success"
          href="/modules/fees"
        />
        <StatTile
          label="Reports"
          value={null}
          hint="Coming soon"
          icon={BarChart3}
          tone="danger"
          href="/modules/reports"
        />
        <StatTile
          label="Session starts"
          value={s1 ? MONTHS[s1.sessionStartMonth - 1] : null}
          hint="Your academic session"
          icon={CalendarRange}
          tone="info"
          href="/school"
        />
      </section>

      <SamplePreview />

      <div className="grid gap-6 lg:grid-cols-3">
        {profile && (
          <div className="lg:col-span-2">
            <SchoolSummary steps={profile.steps} />
          </div>
        )}

        <Card className={cn(!profile && "lg:col-span-3")}>
          <CardHeader>
            <CardTitle>Up next on the roadmap</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {upNext.map((m) => (
                <li key={m.slug}>
                  <Link
                    to={`/modules/${m.slug}`}
                    className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-muted"
                  >
                    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", TONES[m.tone].tile)}>
                      <m.icon className="size-[18px]" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">{m.label}</span>
                    <ArrowRight
                      className="size-4 text-foreground-muted opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
