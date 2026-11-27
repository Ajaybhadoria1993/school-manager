import { useState } from "react";
import { CalendarPlus, Pencil } from "lucide-react";
import { Button } from "@heroui/react";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useCreateExamMutation, useUpdateExamMutation } from "../../redux/api/examsApi";
import type { Exam, ExamScope, ExamType } from "../../types";
import { addDays } from "../../utils/calendar";
import { EXAM_TYPE_CHIPS, defaultExamName, isOfferedName } from "../../utils/exams";
import { todayInIndia } from "../../utils/students";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { ChipPicker } from "../ui/ChipPicker";
import { DateBox } from "../ui/DateBox";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { MultiSelect } from "../ui/Select";

const SCOPE_CHIPS: { value: ExamScope; label: string }[] = [
  { value: "school", label: "Whole school" },
  { value: "departments", label: "Departments" },
  { value: "classes", label: "Classes" },
];

/**
 * Schedule (or change) an exam or a test: what it is (one click), its name (the usual one is offered for the kind), the first day and the
 * last (empty: one day), whom it is for (2026-11-26: the whole school, some departments or some classes; the school's classes and departments
 * are read only for those two), a note. The time of each paper, which is the school's time for its classes that day, is set in the Exam Time
 * Table, not here. Save closes it and tells the page (`onSaved`).
 */
export function ExamDialog({ exam, onClose, onSaved }: { exam: Exam | null; onClose: () => void; onSaved: (exam: Exam, created: boolean) => void }) {
  const [create] = useCreateExamMutation();
  const [update] = useUpdateExamMutation();
  const [type, setType] = useState<ExamType | "">(exam?.type ?? "");
  const [name, setName] = useState(exam?.name ?? "");
  const [startDate, setStartDate] = useState(exam?.startDate ?? "");
  const [endDate, setEndDate] = useState(exam && exam.endDate !== exam.startDate ? exam.endDate : "");
  const [scope, setScope] = useState<ExamScope>(exam?.scope ?? "school");
  const [departmentIds, setDepartmentIds] = useState<string[]>(exam?.scope === "departments" ? (exam.audience?.departments.map((d) => d.id) ?? []) : []);
  const [classIds, setClassIds] = useState<string[]>(exam?.scope === "classes" ? (exam.audience?.classes.map((c) => c.id) ?? []) : []);
  const [note, setNote] = useState(exam?.note ?? "");
  const [tried, setTried] = useState(false);
  const { busy, error, run } = useSave(() => undefined);
  const structure = useGetStructureQuery(undefined, { skip: scope === "school" });
  const today = todayInIndia();

  const problems = {
    type: type === "" ? "Choose what it is" : undefined,
    name: name.trim() === "" ? "Enter the exam name" : undefined,
    startDate: startDate === "" ? "Choose the first day" : undefined,
    endDate: endDate !== "" && startDate !== "" && endDate < startDate ? "The last day cannot be before the first day" : undefined,
    departmentIds: scope === "departments" && departmentIds.length === 0 ? "Choose the departments" : undefined,
    classIds: scope === "classes" && classIds.length === 0 ? "Choose the classes" : undefined,
  };
  const shown = (key: keyof typeof problems) => (tried ? problems[key] : undefined) ?? serverSays(key);
  const serverSays = (path: string) => (Array.isArray(error?.details) ? (error.details as { path?: string; message?: string }[]).find((d) => d?.path === path)?.message : undefined);

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
      scope,
      departmentIds: scope === "departments" ? departmentIds : [],
      classIds: scope === "classes" ? classIds : [],
      // The time is each paper's now (2026-11-26): an older exam's own school hours are let go.
      schoolStart: null,
      schoolEnd: null,
      note: note.trim() || null,
    };
    void run(async () => {
      if (exam) onSaved((await update({ id: exam.id, ...input }).unwrap()).data, false);
      else onSaved((await create(input).unwrap()).data, true);
    });
  }

  const departments = structure.data?.data.departments ?? [];
  const classes = structure.data?.data.classes ?? [];

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
      <Field id="exam-scope" label="For">
        <ChipPicker label="For" value={scope} options={SCOPE_CHIPS} onChange={(v) => setScope(v as ExamScope)} />
      </Field>
      {scope === "departments" && (
        <Field id="exam-departments" label="Departments" error={shown("departmentIds")}>
          <MultiSelect
            id="exam-departments"
            placeholder="Select departments"
            value={departmentIds}
            onChange={setDepartmentIds}
            invalid={!!shown("departmentIds")}
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
          />
        </Field>
      )}
      {scope === "classes" && (
        <Field id="exam-classes" label="Classes" error={shown("classIds")}>
          <MultiSelect id="exam-classes" placeholder="Select classes" value={classIds} onChange={setClassIds} invalid={!!shown("classIds")} options={classes.map((c) => ({ value: c.id, label: c.name }))} />
        </Field>
      )}
      <Field id="exam-note" label="Note" optional>
        <Input id="exam-note" value={note} maxLength={300} placeholder="Bring your own geometry box..." onChange={(e) => setNote(e.target.value)} />
      </Field>
      <ModalError message={error && !["departmentIds", "classIds"].some((p) => serverSays(p)) ? error.message : null} />
    </AppModal>
  );
}
