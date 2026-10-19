"use client";

import Link from "next/link";
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
import { useAuth } from "@/lib/auth-context";
import { useSchoolProfile } from "@/lib/useSchoolProfile";
import { CLASS_LEVELS, MONTHS, formatClassRange } from "@/lib/schoolOptions";
import { MODULES } from "@/lib/modules";
import { TONES } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { KpiCard } from "./school/KpiCard";
import { SamplePreview } from "./school/SamplePreview";
import { SchoolSummary } from "./school/SchoolSummary";
import { WelcomeBanner } from "./school/WelcomeBanner";

/** How many classes run from the lowest to the highest the school named, or null if it has not said. */
function classCount(lowest: string | null, highest: string | null) {
  const from = CLASS_LEVELS.findIndex((c) => c === lowest);
  const to = CLASS_LEVELS.findIndex((c) => c === highest);
  return from >= 0 && to >= from ? to - from + 1 : null;
}

/**
 * The home page of an approved school. The numbers that come from the school's own answers are real; everything that
 * needs a module we have not built yet shows a dash and "Coming soon" instead of an invented number.
 */
export function SchoolDashboard() {
  const { user, tenant } = useAuth();
  const profile = useSchoolProfile();
  if (!user) return null;

  const s1 = profile?.steps[1];
  const classes = s1 ? classCount(s1.lowestClass, s1.highestClass) : null;
  const upNext = MODULES.filter((m) =>
    ["attendance", "students", "fees", "hrms"].includes(m.slug),
  );

  return (
    <div className="space-y-8">
      <WelcomeBanner
        firstName={user.name.split(" ")[0]}
        schoolName={tenant?.name ?? "Your school"}
      />

      <section
        aria-label="School at a glance"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <KpiCard
          index={0}
          label="Students"
          value={s1?.approxStudents ?? null}
          hint={
            s1?.approxStudents
              ? "About, from your registration"
              : "Student records are coming soon"
          }
          icon={GraduationCap}
          tone="primary"
          href="/modules/students"
        />
        <KpiCard
          index={1}
          label="Teachers and staff"
          value={null}
          hint="Coming soon"
          icon={UsersRound}
          tone="success"
          href="/modules/hrms"
        />
        <KpiCard
          index={2}
          label="Classes"
          value={classes}
          hint={formatClassRange(s1?.lowestClass ?? null, s1?.highestClass ?? null) || "From your registration"}
          icon={Layers}
          tone="info"
          href="/school"
        />
        <KpiCard
          index={3}
          label="Administrators"
          value={1}
          hint="You, as the school admin"
          icon={ShieldCheck}
          tone="navy"
          href="/school"
        />
        <KpiCard
          index={4}
          label="Present today"
          value={null}
          hint="Coming soon"
          icon={CalendarCheck}
          tone="warning"
          href="/modules/attendance"
        />
        <KpiCard
          index={5}
          label="Fees collected"
          value={null}
          hint="Coming soon"
          icon={BadgeIndianRupee}
          tone="success"
          href="/modules/fees"
        />
        <KpiCard
          index={6}
          label="Reports"
          value={null}
          hint="Coming soon"
          icon={BarChart3}
          tone="danger"
          href="/modules/reports"
        />
        <KpiCard
          index={7}
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
                    href={`/modules/${m.slug}`}
                    className="group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-muted"
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-110",
                        TONES[m.tone].tile,
                      )}
                    >
                      <m.icon className="size-[18px]" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                      {m.label}
                    </span>
                    <ArrowRight
                      className="size-4 text-foreground-muted opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100"
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
