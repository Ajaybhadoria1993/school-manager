import { useMemo, useState } from "react";
import { Clock3, RotateCcw } from "lucide-react";
import { Button } from "@heroui/react";
import { useSaveClassDayMutation } from "../../redux/api/timetableApi";
import { classDayBody, classOwnTimings, classWeek, usualRows } from "../../utils/classWeek";
import { dayProblem } from "../../utils/schoolWeek";
import { generateDay, setupFromSlots, type DaySetup } from "../../utils/timings";
import type { ClassItem, Schedule } from "../../types";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { Field } from "../ui/Field";
import { Select } from "../ui/Select";
import { useToast } from "../ui/toast-context";
import { DayFields, DayPreview } from "./DayFields";

/**
 * One class's own timing (2026-11-13), from the School timings page: the same boxes as the school's day and a department's (starts, each
 * period, how many, assembly, lunch, a short break), for the whole class (every section of it). Adding picks the class first (a class that
 * has a timing of its own is not offered again); changing opens the class that was clicked. It starts from the day the class has now, so
 * only what differs has to be changed. Save writes the rows for every day the class follows the school's usual day (`PUT /timetable/class-day`;
 * a short Saturday of the school is left to the school), and nothing is sent while the boxes are what the class already has. *Use the school's
 * timing* takes the class's own days away. Lessons in a period the class will no longer have are asked about first and taken out only when
 * the person agrees.
 */
export function ClassOwnTimingDialog({ classes, schedules, classId, onClose }: { classes: ClassItem[]; schedules: Schedule[]; /** The class being changed; none when one is being added. */ classId: string | null; onClose: () => void }) {
  const { push } = useToast();
  const [saveClassDay] = useSaveClassDayMutation();
  const { busy, error, run, clearError } = useSave(onClose);

  const owned = useMemo(() => new Set(classOwnTimings(schedules).map((o) => o.classId)), [schedules]);
  const [chosen, setChosen] = useState(classId ?? "");
  const [typed, setTyped] = useState<{ classId: string; setup: DaySetup } | null>(null);
  const [tried, setTried] = useState<"save" | "school">("save");

  const klass = classes.find((c) => c.id === chosen) ?? null;
  const days = useMemo(() => (chosen ? classWeek(schedules, chosen) : []), [schedules, chosen]);
  // What the class has now (its own day, or the school's it follows): the boxes start from it.
  const base = useMemo(() => setupFromSlots(usualRows(days)), [days]);
  const setup = typed && typed.classId === chosen ? typed.setup : base;
  const hasOwn = chosen !== "" && owned.has(chosen);
  const problem = chosen ? dayProblem(setup) : undefined;
  const body = chosen && !problem ? classDayBody(chosen, days, generateDay(setup).slots, false) : null;
  // A class that follows the school has something to save only when its rows are not the school's; one that has a timing of its own, when its boxes changed.
  const canSave = body !== null && (hasOwn ? JSON.stringify(setup) !== JSON.stringify(base) : body.days.length > 0);

  const asked = error?.code === "LESSONS_IN_REMOVED_PERIODS";
  const send = (what: "save" | "school", removeLessons: boolean) =>
    run(async () => {
      if (!klass || !body) return;
      setTried(what);
      await saveClassDay({ ...body, days: what === "school" ? [] : body.days, removeLessons }).unwrap();
      push("success", what === "school" ? `${klass.name} follows the school's timing` : `${klass.name}: timing saved`);
    });

  const free = classes.filter((c) => !owned.has(c.id));

  return (
    <AppModal
      title={classId && klass ? `${klass.name} timing` : "Add class timing"}
      icon={Clock3}
      busy={busy}
      size="lg"
      onClose={onClose}
      footer={
        asked ? (
          <>
            <Button variant="secondary" onPress={clearError} isDisabled={busy}>
              Go back
            </Button>
            <Button variant="danger" isPending={busy} onPress={() => void send(tried, true)}>
              Take those lessons out and save
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onPress={onClose} isDisabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" isPending={busy} isDisabled={!canSave} onPress={() => void send("save", false)}>
              Save
            </Button>
          </>
        )
      }
    >
      {asked ? (
        <div role="alert" className="space-y-2 rounded-xl border border-warning-line bg-warning-soft px-4 py-3 text-sm text-warning">
          <p className="font-semibold">{error?.message}</p>
          <p>If you go on, those lessons are taken out of the timetable of every section of {klass?.name}. This cannot be undone.</p>
        </div>
      ) : (
        <>
          {!classId && (
            <Field quiet id="class-own-class" label="Class">
              <Select
                id="class-own-class"
                value={chosen}
                placeholder="Choose a class"
                options={free.map((c) => ({ value: c.id, label: c.name }))}
                onChange={(next) => {
                  setChosen(next);
                  setTyped(null);
                  clearError();
                }}
              />
            </Field>
          )}
          {klass && (
            <>
              <DayFields
                adaptive
                idPrefix="class-own"
                name={klass.name}
                value={setup}
                onChange={(next) => {
                  clearError();
                  setTyped({ classId: klass.id, setup: next });
                }}
              />
              <DayPreview name={`${klass.name}, period by period`} value={setup} />
              {problem && (
                <p role="alert" className="text-sm font-medium text-danger">
                  {problem}
                </p>
              )}
              <ModalError message={error ? error.message : null} />
              {hasOwn && (
                <div>
                  <Button variant="ghost" size="sm" isDisabled={busy} onPress={() => void send("school", false)}>
                    <RotateCcw className="size-4" aria-hidden />
                    Use the school's timing
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </AppModal>
  );
}
