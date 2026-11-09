import { useState } from "react";
import { Copy, PencilLine } from "lucide-react";
import { Button } from "@heroui/react";
import { DAY_NAMES } from "../../constants/timetable";
import { useCopyGridMutation } from "../../redux/api/timetableApi";
import { cn } from "../../utils/helpers";
import type { CopyAnswer, GridCell, GridView, Lesson, UnitRef } from "../../types";
import type { GridModel } from "../../utils/timetable";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";

/**
 * One period's lessons: who teaches each (the usual teacher of the subject, or another one for this lesson) and the room, if it needs one.
 * Teachers who are busy then (in another class) or do not come that day are shown and cannot be picked. Nothing is sent: "Done" changes
 * the grid on the screen, which is saved with the page's Save.
 */
export function LessonDialog({
  view,
  model,
  cell,
  onDone,
  onTakeOut,
  onClose,
}: {
  view: GridView;
  model: GridModel;
  cell: GridCell;
  onDone: (lessons: Lesson[]) => void;
  onTakeOut: () => void;
  onClose: () => void;
}) {
  const [lessons, setLessons] = useState<Lesson[]>(cell.lessons);
  const slot = view.days.find((d) => d.day === cell.day)?.slots.find((s) => s.period === cell.period);
  const change = (subjectId: string, patch: Partial<Lesson>) => setLessons((all) => all.map((l) => (l.subjectId === subjectId ? { ...l, ...patch } : l)));

  /** Why a teacher cannot be given this period, or null. */
  const why = (teacherId: string): string | null => {
    const teacher = model.teachers.get(teacherId);
    if (!teacher) return null;
    if (teacher.offDays.includes(cell.day)) return "does not come";
    return model.busy.some((b) => b.teacherId === teacherId && b.day === cell.day && b.period === cell.period) ? "busy then" : null;
  };

  return (
    <AppModal
      title={`${DAY_NAMES[cell.day]}, ${slot?.label ?? `Period ${cell.period}`}`}
      icon={PencilLine}
      onClose={onClose}
      footer={
        <>
          <Button variant="danger-soft" onPress={onTakeOut}>
            Take it out of this period
          </Button>
          <Button variant="secondary" onPress={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onPress={() => onDone(lessons.map((l) => ({ ...l, room: l.room?.trim() ? l.room.trim() : null })))}>
            Done
          </Button>
        </>
      }
    >
      <p className="text-sm text-foreground-muted">{slot ? `${slot.start} to ${slot.end}` : ""}</p>
      {lessons.map((lesson) => {
        const allotment = model.allotments.get(lesson.subjectId);
        const usual = allotment?.teacherId ? model.teachers.get(allotment.teacherId)?.name : null;
        return (
          <fieldset key={lesson.subjectId} className="space-y-3 rounded-xl border border-border p-3">
            <legend className="px-1 text-sm font-bold text-foreground">{allotment?.subjectName ?? "A subject"}</legend>
            <Field id={`lesson-teacher-${lesson.subjectId}`} label="Teacher" quiet hint={usual ? undefined : "No teacher is named for this subject in this class yet."}>
              <Select
                id={`lesson-teacher-${lesson.subjectId}`}
                value={lesson.teacherId ?? ""}
                options={[
                  { value: "", label: usual ? `${usual} (the usual teacher)` : "No teacher" },
                  ...view.teachers.filter((t) => t.isActive).map((t) => ({ value: t.id, label: `${t.name}${why(t.id) ? ` (${why(t.id)})` : ""}` })),
                ]}
                disabledValues={view.teachers.filter((t) => why(t.id)).map((t) => t.id)}
                onChange={(v) => change(lesson.subjectId, { teacherId: v || null })}
              />
            </Field>
            <Field id={`lesson-room-${lesson.subjectId}`} label="Room" quiet hint="For a lab or the ground. A room is used by one class at a time.">
              <Input id={`lesson-room-${lesson.subjectId}`} value={lesson.room ?? ""} maxLength={30} placeholder="No special room" onChange={(e) => change(lesson.subjectId, { room: e.target.value })} />
            </Field>
          </fieldset>
        );
      })}
    </AppModal>
  );
}

/** Gives this section's saved timetable to the class's other sections: each with its own teachers; what cannot be copied is said. */
export function CopyDialog({ unit, siblings, onClose }: { unit: UnitRef; siblings: { id: string; name: string }[]; onClose: () => void }) {
  const [copy] = useCopyGridMutation();
  const [picked, setPicked] = useState<string[]>([]);
  const [replace, setReplace] = useState(false);
  const [answer, setAnswer] = useState<CopyAnswer | null>(null);
  const { busy, error, run } = useSave(() => undefined);

  return (
    <AppModal
      title="Copy to the other sections"
      icon={Copy}
      busy={busy}
      onClose={onClose}
      footer={
        answer ? (
          <Button variant="primary" onPress={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="secondary" onPress={onClose} isDisabled={busy}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isPending={busy}
              isDisabled={picked.length === 0}
              onPress={() =>
                void run(async () => {
                  setAnswer((await copy({ ...unit, toSections: picked, replace }).unwrap()).data);
                })
              }
            >
              Copy
            </Button>
          </>
        )
      }
    >
      {answer ? (
        <ul className="space-y-3" aria-label="What was copied">
          {answer.results.some((r) => r.left.some((l) => l.reason.includes("is teaching"))) && (
            <li className="rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
              A teacher cannot be in two sections at the same time, so those lessons were left out. Open the section and press "Fill the empty periods": it fills around the teachers.
            </li>
          )}
          {answer.results.map((r) => (
            <li key={r.sectionId} className="rounded-xl border border-border p-3 text-sm">
              <p className="font-bold text-foreground">
                {r.label}: {r.status === "copied" ? `${r.copied} period${r.copied === 1 ? "" : "s"} copied` : r.reason}
              </p>
              {r.left.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-xs text-foreground-muted">
                  {r.left.map((l) => (
                    <li key={`${l.day}:${l.period}:${l.reason}`}>
                      Left out, {DAY_NAMES[l.day]} period {l.period}: {l.reason}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="text-sm text-foreground-muted">
            The same periods are given to the sections you choose, each with the subjects and the teachers it has. A lesson that would put a teacher in two places is left out, and you are told. The timetable you are looking at must be saved.
          </p>
          <div role="group" aria-label="Sections to copy to" className="flex flex-wrap gap-2">
            {siblings.map((s) => {
              const on = picked.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(on ? picked.filter((x) => x !== s.id) : [...picked, s.id])}
                  className={cn("h-9 cursor-pointer rounded-lg border px-3 text-sm font-semibold transition-colors", on ? "border-transparent bg-primary-soft text-primary-deep ring-2 ring-inset ring-primary/25" : "border-border bg-surface text-foreground hover:border-primary/50")}
                >
                  Section {s.name}
                </button>
              );
            })}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
            <input type="checkbox" className="size-4 accent-primary" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            Replace the lessons a section already has
          </label>
          <ModalError message={error?.message ?? null} />
        </>
      )}
    </AppModal>
  );
}

