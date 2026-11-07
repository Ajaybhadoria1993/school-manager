import { useState } from "react";
import { CalendarPlus, Pencil } from "lucide-react";
import { Button } from "@heroui/react";
import { useCreateExamMutation, useUpdateExamMutation } from "../../redux/api/examsApi";
import type { Exam, ExamType } from "../../types";
import { addDays } from "../../utils/calendar";
import { EXAM_TYPE_CHIPS, defaultExamName, isFullExam, isOfferedName, minutesOf } from "../../utils/exams";
import { todayInIndia } from "../../utils/students";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { ChipPicker } from "../ui/ChipPicker";
import { DateBox } from "../ui/DateBox";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";

/**
 * Schedule (or change) an exam or a test: what it is (one click), its name (the usual one is offered for the kind), the first day and the
 * last (empty: one day), for a full exam the hours the school keeps while it is on (empty: the school day goes on as usual), a note.
 * Save closes it and tells the page (`onSaved`).
 */
export function ExamDialog({ exam, onClose, onSaved }: { exam: Exam | null; onClose: () => void; onSaved: (exam: Exam, created: boolean) => void }) {
  const [create] = useCreateExamMutation();
  const [update] = useUpdateExamMutation();
  const [type, setType] = useState<ExamType | "">(exam?.type ?? "");
  const [name, setName] = useState(exam?.name ?? "");
  const [startDate, setStartDate] = useState(exam?.startDate ?? "");
  const [endDate, setEndDate] = useState(exam && exam.endDate !== exam.startDate ? exam.endDate : "");
  const [schoolStart, setSchoolStart] = useState(exam?.schoolHours?.start ?? "");
  const [schoolEnd, setSchoolEnd] = useState(exam?.schoolHours?.end ?? "");
  const [note, setNote] = useState(exam?.note ?? "");
  const [tried, setTried] = useState(false);
  const { busy, error, run } = useSave(() => undefined);
  const today = todayInIndia();
  const full = type !== "" && isFullExam(type);

  const hours = (): string | undefined => {
    if (!full) return undefined;
    if ((schoolStart === "") !== (schoolEnd === "")) return "Give the time the school starts and the time it ends";
    if (schoolStart !== "" && minutesOf(schoolEnd) <= minutesOf(schoolStart)) return "School must end after it starts";
    return undefined;
  };
  const problems = {
    type: type === "" ? "Choose what it is" : undefined,
    name: name.trim() === "" ? "Enter the exam name" : undefined,
    startDate: startDate === "" ? "Choose the first day" : undefined,
    endDate: endDate !== "" && startDate !== "" && endDate < startDate ? "The last day cannot be before the first day" : undefined,
    hours: hours(),
  };
  const shown = (key: keyof typeof problems) => (tried ? problems[key] : undefined);

  function choose(next: ExamType) {
    // The usual name of the kind is offered; one the school typed is left alone.
    if (isOfferedName(name)) setName(defaultExamName(next));
    setType(next);
  }

  function save() {
    setTried(true);
    if (Object.values(problems).some(Boolean) || type === "") return;
    const input = {
      name: name.trim(),
      type,
      startDate,
      endDate: endDate || startDate,
      schoolStart: full && schoolStart !== "" ? schoolStart : null,
      schoolEnd: full && schoolEnd !== "" ? schoolEnd : null,
      note: note.trim() || null,
    };
    void run(async () => {
      if (exam) onSaved((await update({ id: exam.id, ...input }).unwrap()).data, false);
      else onSaved((await create(input).unwrap()).data, true);
    });
  }

  return (
    <AppModal
      title={exam ? `Change ${exam.name}` : "Schedule exam"}
      icon={exam ? Pencil : CalendarPlus}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onPress={onClose} isDisabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" isPending={busy} onPress={save}>
            Save
          </Button>
        </>
      }
    >
      <Field id="exam-type" label="What is it" error={shown("type")}>
        <ChipPicker label="What is it" value={type} options={EXAM_TYPE_CHIPS} onChange={(v) => choose(v as ExamType)} />
      </Field>
      <Field id="exam-name" label="Name" error={shown("name")}>
        <Input id="exam-name" value={name} maxLength={80} placeholder="Half-Yearly Exam, Unit Test 1..." aria-invalid={shown("name") ? true : undefined} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="exam-start" label="First day" error={shown("startDate")}>
          <DateBox
            id="exam-start"
            label="First day"
            value={startDate}
            onChange={setStartDate}
            invalid={!!shown("startDate")}
            shortcuts={[
              { label: "Today", value: today },
              { label: "Tomorrow", value: addDays(today, 1) },
            ]}
          />
        </Field>
        <Field id="exam-end" label="Last day" optional error={shown("endDate")}>
          <DateBox id="exam-end" label="Last day" value={endDate} onChange={setEndDate} min={startDate || undefined} invalid={!!shown("endDate")} />
        </Field>
      </div>
      {full && (
        <div>
          <p className="mb-1.5 text-sm font-semibold text-foreground">
            School hours while it is on <span className="font-normal text-foreground-muted">(optional)</span>
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="exam-school-start" label="School starts" quiet error={shown("hours")}>
              <Input id="exam-school-start" type="time" value={schoolStart} onChange={(e) => setSchoolStart(e.target.value)} />
            </Field>
            <Field id="exam-school-end" label="School ends" quiet>
              <Input id="exam-school-end" type="time" value={schoolEnd} onChange={(e) => setSchoolEnd(e.target.value)} />
            </Field>
          </div>
        </div>
      )}
      <Field id="exam-note" label="Note" optional>
        <Input id="exam-note" value={note} maxLength={300} placeholder="Bring your own geometry box..." onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ModalError message={error?.message ?? null} />
    </AppModal>
  );
}
