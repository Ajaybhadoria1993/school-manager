"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { TimetableTab } from "@/components/academics/TimetableTab";
import { HomeworkTab } from "@/components/academics/HomeworkTab";
import { ExamsTab } from "@/components/academics/ExamsTab";
import { ReportCardsTab } from "@/components/academics/ReportCardsTab";

const TABS = ["Timetable", "Homework", "Exams & Marks", "Report Cards"] as const;

const MANAGE_ROLES = ["super_admin", "school_admin", "principal"];
const CREATE_ROLES = ["super_admin", "school_admin", "principal", "teacher"];
const PUBLISH_ROLES = ["super_admin", "school_admin", "principal"];

export default function AcademicsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Timetable");

  const canManageTimetable = !!user && MANAGE_ROLES.includes(user.role);
  const canCreate = !!user && CREATE_ROLES.includes(user.role);
  const canPublish = !!user && PUBLISH_ROLES.includes(user.role);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Academics</h2>
        <p className="text-sm text-foreground-muted">Timetable, homework, exams, marks entry and report cards.</p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === t ? "border-primary text-primary" : "border-transparent text-foreground-muted hover:text-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Timetable" && <TimetableTab canEdit={canManageTimetable} />}
      {tab === "Homework" && <HomeworkTab canCreate={canCreate} />}
      {tab === "Exams & Marks" && <ExamsTab canManage={canManageTimetable} canReopen={canPublish} />}
      {tab === "Report Cards" && <ReportCardsTab canPublish={canPublish} />}
    </div>
  );
}
