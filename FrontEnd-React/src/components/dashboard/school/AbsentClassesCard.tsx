import { UserX } from "lucide-react";
import type { SchoolDashboard } from "../../../types";
import { rangeLabel } from "../../../utils/dashboardRange";
import { BarList } from "../charts/BarList";
import { DashCard } from "./DashCard";

/** The classes with the most absences in the days picked (Infinity Medisetu's Top Symptoms): a bar for each, the most first. */
export function AbsentClassesCard({ period }: { period: SchoolDashboard["period"] }) {
  return (
    <DashCard title="Classes with most absences" description={rangeLabel(period)} icon={<UserX className="size-4" />}>
      {period.absentClasses.length === 0 ? (
        <p className="flex min-h-40 items-center justify-center text-center text-sm text-foreground-muted">No absences in this period</p>
      ) : (
        <BarList title="Absences by class" rows={period.absentClasses.map((c) => ({ key: c.classId, label: c.name, value: c.absent }))} unit={["absence", "absences"]} />
      )}
    </DashCard>
  );
}
