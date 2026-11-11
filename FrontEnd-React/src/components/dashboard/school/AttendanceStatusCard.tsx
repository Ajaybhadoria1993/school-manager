import { Link } from "react-router";
import { ArrowRight, PieChart } from "lucide-react";
import type { SchoolDashboard } from "../../../types";
import { pointsChange, rangeLabel } from "../../../utils/dashboardRange";
import { shareOf } from "../../../utils/dashboard";
import { NOT_YET, STATUS } from "../charts/palette";
import { DashCard } from "./DashCard";

const SIZE = 136;
const STROKE = 20;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCLE = 2 * Math.PI * RADIUS;

/**
 * Attendance Status (the look of Infinity Medisetu's Appointment Status): the children's marks of the days picked as a donut with every
 * status and its number and share beside it (a status with none keeps its row), the total in the middle; under it how the teachers did
 * against the days before. The colours are the status colours and every segment also has its word.
 */
export function AttendanceStatusCard({ period, comparison, manages }: { period: SchoolDashboard["period"]; comparison: string; manages: boolean }) {
  const a = period.attendance;
  const slices = [
    { key: "present", label: "Present", value: a.present, color: STATUS.good },
    { key: "late", label: "Late", value: a.late, color: STATUS.warning },
    { key: "absent", label: "Absent", value: a.absent, color: STATUS.critical },
    { key: "leave", label: "Leave", value: a.leave, color: STATUS.leave },
  ];
  const total = slices.reduce((n, s) => n + s.value, 0);
  const teacherChange = pointsChange(period.teachers.percent, period.teachers.before.percent);
  let used = 0;

  return (
    <DashCard
      title="Attendance Status"
      description={rangeLabel(period)}
      icon={<PieChart className="size-4" />}
      aside={
        manages && (
          <Link to="/attendance/students" className="inline-flex items-center gap-1 text-primary hover:text-primary-deep">
            View
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        )
      }
    >
      {total === 0 ? (
        <p className="flex min-h-40 items-center justify-center text-center text-sm text-foreground-muted">No attendance marked in this period</p>
      ) : (
        <div className="flex flex-1 flex-col gap-4">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
            <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
              <svg role="img" aria-label="Children by attendance status" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
                <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke={NOT_YET} strokeOpacity="0.35" strokeWidth={STROKE} />
                {slices
                  .filter((s) => s.value > 0)
                  .map((s) => {
                    const length = (s.value / total) * CIRCLE;
                    const gap = slices.filter((x) => x.value > 0).length > 1 ? 2 : 0;
                    const el = (
                      <circle
                        key={s.key}
                        cx={SIZE / 2}
                        cy={SIZE / 2}
                        r={RADIUS}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={STROKE}
                        strokeDasharray={`${Math.max(length - gap, 0)} ${CIRCLE - Math.max(length - gap, 0)}`}
                        strokeDashoffset={-used}
                      />
                    );
                    used += length;
                    return el;
                  })}
              </svg>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-metric-headline leading-none">{total}</span>
                <span className="mt-1 text-xs text-foreground-muted">Total</span>
              </div>
            </div>

            <ul className="w-full min-w-0 divide-y divide-border">
              {slices.map((s) => (
                <li key={s.key} className={`flex items-center gap-2 py-1.5 ${s.value === 0 ? "opacity-60" : ""}`}>
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{s.label}</span>
                  <span className="w-9 text-right text-sm font-semibold tabular-nums text-foreground">{s.value}</span>
                  <span className="w-10 text-right text-xs tabular-nums text-foreground-muted">{shareOf(s.value, total)}%</span>
                </li>
              ))}
            </ul>
          </div>

          {period.teachers.percent !== null && (
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
              <span className="text-foreground-muted">Teachers in school</span>
              <span className="flex items-center gap-x-2">
                <span className="font-semibold text-foreground">{period.teachers.percent}%</span>
                {teacherChange !== null && teacherChange !== 0 && (
                  <span className="flex items-center gap-x-1 text-xs">
                    <span className={`font-semibold ${teacherChange > 0 ? "text-success" : "text-danger"}`}>{teacherChange > 0 ? `↑ +${teacherChange}%` : `↓ ${teacherChange}%`}</span>
                    <span className="text-foreground-muted">vs {comparison}</span>
                  </span>
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </DashCard>
  );
}
