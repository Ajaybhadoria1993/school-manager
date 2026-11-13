import { useMemo, useState } from "react";
import { Clock3, Undo2 } from "lucide-react";
import { Button } from "@heroui/react";
import { useRemoveDepartmentDayMutation, useSaveSchoolDayMutation } from "../../redux/api/timetableApi";
import { deptProblem, deptRows, storedSetup, type DeptSetup } from "../../utils/departmentDay";
import { departmentRowsBody, usualDays, type WeekPlan } from "../../utils/schoolWeek";
import { generateDay } from "../../utils/timings";
import type { DepartmentItem, Schedule } from "../../types";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { useToast } from "../ui/toast-context";
import { DayFields, HoursFields } from "./DayFields";

/**
 * One department's own timing (2026-11-13: *Change timing* opens this window instead of boxes in the card): the same boxes as the school's
 * day (Pre-Primary: school starts, school ends and a lunch, since periods do not matter there), starting from what the department has now,
 * or from the school's day when it has no timing of its own, so only what differs has to be changed. Save writes it for the school's
 * usual days (`PUT /timetable/school-day {departmentId}`) and closes the window; it waits until something is different. **Same as school**
 * (only for a department that has its own timing) takes its own timing away (`DELETE`), after asking. `plan` is the school's week as it is saved.
 */
export function DepartmentTimingDialog({ department, schedules, plan, onClose }: { department: DepartmentItem; schedules: Schedule[]; plan: WeekPlan; onClose: () => void }) {
  const { push } = useToast();
  const [saveWeek] = useSaveSchoolDayMutation();
  const [removeOwn] = useRemoveDepartmentDayMutation();
  const { busy, error, run, clearError } = useSave(onClose);
  // "Same as school" takes the department's own timing away: the window asks first, in place of the boxes.
  const [asking, setAsking] = useState(false);

  const periodMinutes = plan.usual.periodMinutes;
  const have = useMemo(() => storedSetup(department, schedules, plan.usual), [department, schedules, plan.usual]);
  const [typed, setTyped] = useState<DeptSetup | null>(null);
  const setup = typed ?? have.setup;
  const changed = typed !== null && JSON.stringify(typed) !== JSON.stringify(have.setup);
  const problem = deptProblem(setup, periodMinutes) ?? (usualDays(plan).length === 0 ? "Set the school's week first: it has no usual day yet" : undefined);
  const notes = setup.kind === "periods" ? generateDay(setup.setup).notes : [];
  const edit = (next: DeptSetup) => {
    clearError();
    setTyped(next);
  };

  const save = () =>
    run(async () => {
      await saveWeek(departmentRowsBody(plan, deptRows(setup, periodMinutes), department.id)).unwrap();
      push("success", `${department.name}'s timing saved`);
    });
  const sameAsSchool = () =>
    run(async () => {
      await removeOwn(department.id).unwrap();
      push("success", `${department.name} follows the school's timing`);
    });

  return (
    <AppModal
      title={`${department.name} timing`}
      icon={Clock3}
      busy={busy}
      size="lg"
      onClose={onClose}
      footer={
        asking ? (
          <>
            <Button variant="secondary" onPress={() => setAsking(false)} isDisabled={busy}>
              Back
            </Button>
            <Button variant="primary" isPending={busy} onPress={() => void sameAsSchool()}>
              Use the school's timing
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onPress={onClose} isDisabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" isPending={busy} isDisabled={!changed || problem !== undefined} onPress={() => void save()}>
              Save
            </Button>
          </>
        )
      }
    >
      {asking ? (
        <div className="space-y-3 text-sm">
          <p className="font-semibold text-foreground">{department.name} will follow the school's timing again.</p>
          <p>
            Its own timing is taken away. A class with a timing of its own keeps it. You can give {department.name} a timing of its own again at any time.
          </p>
          <ModalError message={error ? error.message : null} />
        </div>
      ) : (
      <>
      {setup.kind === "hours" ? (
        <HoursFields idPrefix="dept-window" name={department.name} value={setup.hours} onChange={(hours) => edit({ kind: "hours", hours })} />
      ) : (
        <DayFields adaptive idPrefix="dept-window" name={department.name} value={setup.setup} onChange={(next) => edit({ kind: "periods", setup: next })} />
      )}
      {notes.map((note) => (
        <p key={note} className="text-xs font-medium text-warning">
          {note}
        </p>
      ))}
      {changed && problem && (
        <p role="alert" className="text-sm font-medium text-danger">
          {problem}
        </p>
      )}
      <ModalError message={error ? error.message : null} />
      {have.stored && (
        <div>
          <Button variant="ghost" size="sm" isDisabled={busy} onPress={() => setAsking(true)}>
            <Undo2 className="size-4" aria-hidden />
            Same as school
          </Button>
        </div>
      )}
      </>
      )}
    </AppModal>
  );
}
