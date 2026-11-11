import type { SchoolDashboard } from "../../../types";
import { BarList } from "../charts/BarList";
import { SERIES } from "../charts/palette";
import { SegmentBar } from "../charts/SegmentBar";
import { DashCard } from "./DashCard";

/**
 * The students of the school by class: boys, girls (and others, when there are any) in one bar, then a bar for each class that has students,
 * in teaching order. A school with no students says so instead of drawing an empty chart.
 */
export function ClassesCard({ students, classes }: { students: SchoolDashboard["students"]; classes: number }) {
  const { gender } = students;
  return (
    <DashCard title="Students by class" aside={`${classes} ${classes === 1 ? "class" : "classes"}`}>
      {students.total === 0 ? (
        <p className="text-sm text-foreground-muted">No students added yet</p>
      ) : (
        <div className="space-y-4">
          <SegmentBar
            label="Boys and girls"
            segments={[
              { key: "male", label: "Boys", value: gender.male, color: SERIES[0] },
              { key: "female", label: "Girls", value: gender.female, color: SERIES[1] },
              ...(gender.other > 0 ? [{ key: "other", label: "Other", value: gender.other, color: SERIES[2] }] : []),
            ]}
          />
          <BarList title="Students by class" rows={students.byClass.map((c) => ({ key: c.classId, label: c.name, value: c.enrolled }))} unit={["student", "students"]} />
        </div>
      )}
    </DashCard>
  );
}
