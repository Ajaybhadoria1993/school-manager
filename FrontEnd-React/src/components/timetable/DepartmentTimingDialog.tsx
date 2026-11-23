import { useMemo, useState } from "react";
import { Clock3, Undo2 } from "lucide-react";
import { Button } from "@heroui/react";
import { useRemoveDepartmentDayMutation, useSaveClassDayMutation, useSaveSchoolDayMutation } from "../../redux/api/timetableApi";
import { classOwnTimings } from "../../utils/classWeek";
import { deptProblem, deptRows, deptSummary, hoursClash, storedSetup, type DeptSetup } from "../../utils/departmentDay";
import { departmentRowsBody, rowsSummary, usualDays, type WeekPlan } from "../../utils/schoolWeek";
import { generateDay, visibleClash } from "../../utils/timings";
import type { ClassItem, DepartmentItem, Schedule } from "../../types";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { ChipPicker } from "../ui/ChipPicker";
import { useToast } from "../ui/toast-context";
import { DayFields, HoursFields } from "./DayFields";
import { DayFigures } from "./TimingParts";

type Choice = "keep" | "match";

/**
 * One department's own timing (2026-11-13: *Change timing* opens this window instead of boxes in the card): the same boxes as the school's
 * day (Pre-Primary: school starts, school ends and a lunch, since periods do not matter there), starting from what the department has now,
 * or from the school's day when it has no timing of its own, so only what differs has to be changed. Save writes it for the school's
 * usual days (`PUT /timetable/school-day {departmentId}`) and closes the window; it waits until something is different. **Same as school**
 * (only for a department that has its own timing) takes its own timing away (`DELETE`), after asking. `plan` is the school's week as it is saved.
 *
 * A class of the department may have a timing of its own, which beats the department's (2026-11-23, user: "class ka time pehle se change tha, fir
 * department ka time change kiya: modal aaye ki is class ka time ye hai, ise alag rakhein ya department ke time se match kar dein"). Save then asks,
 * for each such class, **Keep its own timing** or **Use <department>'s timing** (its own timing is taken away, so it follows the department); a
 * class with lessons in periods it would lose is asked once more before those lessons are taken out.
 */
export function DepartmentTimingDialog({ department, classes, schedules, plan, onClose }: { department: DepartmentItem; classes: ClassItem[]; schedules: Schedule[]; plan: WeekPlan; onClose: () => void }) {
  const { push } = useToast();
  const [saveWeek] = useSaveSchoolDayMutation();
  const [saveClassDay] = useSaveClassDayMutation();
  const [removeOwn] = useRemoveDepartmentDayMutation();
  const { busy, error, run, clearError } = useSave(onClose);
  // "Same as school" takes the department's own timing away: the window asks first, in place of the boxes.
  const [asking, setAsking] = useState(false);
  // Save with classes of the department that keep hours of their own: the window asks about each, in place of the boxes.
  const [choosing, setChoosing] = useState(false);
  const [choices, setChoices] = useState<Record<string, Choice>>({});

  const periodMinutes = plan.usual.periodMinutes;
  const have = useMemo(() => storedSetup(department, schedules, plan.usual), [department, schedules, plan.usual]);
  const [typed, setTyped] = useState<DeptSetup | null>(null);
  const setup = typed ?? have.setup;
  const changed = typed !== null && JSON.stringify(typed) !== JSON.stringify(have.setup);
  const problem = deptProblem(setup, periodMinutes) ?? (usualDays(plan).length === 0 ? "Set the school's week first: it has no usual day yet" : undefined);
  // A break inside a period is said by the boxes themselves (with the way to move it), so it is not said again here (2026-11-22); nor is a period
  // "cut" any more: every period is the same length.
  const hours = setup.kind === "hours" ? hoursClash(setup.hours, periodMinutes) : null;
  const clash = setup.kind === "periods" ? visibleClash(setup.setup) : hours && (hours.lunch ?? hours.end);
  const notes = setup.kind === "periods" ? generateDay(setup.setup).notes.filter((n) => !/ is cut to /.test(n)) : [];

  // The department's classes that have a timing of their own, in the school's order.
  const ownHere = useMemo(() => {
    const byId = new Map(classes.map((c) => [c.id, c]));
    return classOwnTimings(schedules)
      .flatMap((o) => {
        const klass = byId.get(o.classId);
        return klass && klass.departmentId === department.id ? [{ klass, rows: o.rows }] : [];
      })
      .sort((a, b) => a.klass.order - b.klass.order);
  }, [classes, schedules, department.id]);
  const allChosen = ownHere.every((o) => choices[o.klass.id]);
  const lessonsAsked = error?.code === "LESSONS_IN_REMOVED_PERIODS";

  const edit = (next: DeptSetup) => {
    clearError();
    setTyped(next);
  };

  /** Saves the department's timing, then takes away the own timing of each class chosen to follow it (`removeLessons` once agreed to). */
  const save = (removeLessons = false) =>
    run(async () => {
      await saveWeek(departmentRowsBody(plan, deptRows(setup, periodMinutes), department.id)).unwrap();
      const matching = ownHere.filter((o) => choices[o.klass.id] === "match");
      for (const o of matching) await saveClassDay({ classId: o.klass.id, days: [], removeLessons }).unwrap();
      push("success", matching.length > 0 ? `${department.name}'s timing saved · ${matching.map((o) => o.klass.name).join(", ")} ${matching.length === 1 ? "follows" : "follow"} it` : `${department.name}'s timing saved`);
    });
  const sameAsSchool = () =>
    run(async () => {
      await removeOwn(department.id).unwrap();
      push("success", `${department.name} follows the school's timing`);
    });

  const footer = asking ? (
    <>
      <Button variant="secondary" onPress={() => setAsking(false)} isDisabled={busy}>
        Back
      </Button>
      <Button variant="primary" isPending={busy} onPress={() => void sameAsSchool()}>
        Use the school's timing
      </Button>
    </>
  ) : choosing ? (
    <>
      <Button
        variant="secondary"
        onPress={() => {
          clearError();
          setChoosing(false);
        }}
        isDisabled={busy}
      >
        Back
      </Button>
      {lessonsAsked ? (
        <Button variant="danger" isPending={busy} onPress={() => void save(true)}>
          Take those lessons out and save
        </Button>
      ) : (
        <Button variant="primary" isPending={busy} isDisabled={!allChosen} onPress={() => void save()}>
          Save
        </Button>
      )}
    </>
  ) : (
    <>
      <Button variant="secondary" onPress={onClose} isDisabled={busy}>
        Cancel
      </Button>
      <Button variant="primary" isPending={busy} isDisabled={!changed || problem !== undefined} onPress={() => (ownHere.length > 0 ? setChoosing(true) : void save())}>
        Save
      </Button>
    </>
  );

  return (
    <AppModal title={`${department.name} timing`} icon={Clock3} busy={busy} size="lg" onClose={onClose} footer={footer}>
      {asking ? (
        <div className="space-y-3 text-sm">
          <p className="font-semibold text-foreground">{department.name} will follow the school's timing again.</p>
          <p>
            Its own timing is taken away. A class with a timing of its own keeps it. You can give {department.name} a timing of its own again at any time.
          </p>
          <ModalError message={error ? error.message : null} />
        </div>
      ) : choosing ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-primary/20 bg-primary-soft/50 px-4 py-3 text-sm">
            <p className="font-semibold text-foreground">
              {ownHere.length === 1 ? `${ownHere[0].klass.name} has a timing of its own` : `${ownHere.length} classes of ${department.name} have a timing of their own`}
            </p>
            <p className="text-foreground-muted">
              {department.name}'s new timing: {deptSummary(setup, periodMinutes)}
            </p>
          </div>
          <ul aria-label="Classes with their own timing" className="space-y-3">
            {ownHere.map(({ klass, rows }) => (
              <li key={klass.id} aria-label={klass.name} className="space-y-2.5 rounded-xl border border-border px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-foreground">{klass.name}</p>
                  <p className="text-xs text-foreground-muted">Its own timing: {rowsSummary(rows)}</p>
                </div>
                <ChipPicker
                  label={`${klass.name}: which timing`}
                  value={choices[klass.id] ?? ""}
                  onChange={(v) => {
                    clearError();
                    setChoices((all) => ({ ...all, [klass.id]: v as Choice }));
                  }}
                  options={[
                    { value: "keep", label: "Keep its own timing" },
                    { value: "match", label: `Use ${department.name}'s timing` },
                  ]}
                />
              </li>
            ))}
          </ul>
          {lessonsAsked ? (
            <div role="alert" className="space-y-1 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning">
              <p className="font-semibold">{error?.message}</p>
              <p>{department.name}'s timing is saved. If you go on, those lessons are taken out of the class's timetable. This cannot be undone.</p>
            </div>
          ) : (
            <ModalError message={error ? error.message : null} />
          )}
        </div>
      ) : (
        <>
          {/* The day's figures, as on the School timings page (2026-11-22): school time, class time, periods, lunch. */}
          <DayFigures slots={deptRows(setup, periodMinutes)} />
          {setup.kind === "hours" ? (
            <HoursFields idPrefix="dept-window" name={department.name} value={setup.hours} schoolPeriod={periodMinutes} onChange={(next) => edit({ kind: "hours", hours: next })} />
          ) : (
            <DayFields adaptive idPrefix="dept-window" name={department.name} value={setup.setup} onChange={(next) => edit({ kind: "periods", setup: next })} />
          )}
          {notes.map((note) => (
            <p key={note} className="text-xs font-medium text-warning">
              {note}
            </p>
          ))}
          {changed && problem && !clash && (
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
