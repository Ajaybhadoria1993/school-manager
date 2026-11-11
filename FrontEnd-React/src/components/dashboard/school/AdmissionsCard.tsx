import type { SchoolDashboard } from "../../../types";
import { monthName } from "../../../utils/dashboard";
import { Columns } from "../charts/Columns";
import { DashCard } from "./DashCard";

/** The students admitted in each of the last six months, as columns; "No admissions in the last 6 months" instead of six empty slots. */
export function AdmissionsCard({ admissions }: { admissions: SchoolDashboard["admissions"] }) {
  const none = admissions.every((m) => m.count === 0);
  return (
    <DashCard title="Admissions" aside="Last 6 months">
      {none ? (
        <p className="text-sm text-foreground-muted">No admissions in the last 6 months</p>
      ) : (
        <Columns
          title="Admissions by month"
          rows={admissions.map((m) => ({
            key: m.month,
            label: monthName(m.month).short,
            value: m.count,
            tip: `${monthName(m.month).full}: ${m.count} ${m.count === 1 ? "admission" : "admissions"}`,
          }))}
        />
      )}
    </DashCard>
  );
}
