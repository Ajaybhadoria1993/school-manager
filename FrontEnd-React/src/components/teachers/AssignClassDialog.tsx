import { useState } from "react";
import { School } from "lucide-react";
import { Button } from "@heroui/react";
import { MAX_PERIODS_PER_WEEK } from "../../constants/timetable";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useAssignTeacherMutation, useGetAllotmentsQuery, useGetSubjectsQuery, useSetClassTeacherMutation } from "../../redux/api/timetableApi";
import type { Teacher } from "../../types";
import { onlyDigits } from "../../utils/teachers";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { useToast } from "../ui/toast-context";

/** "No subject" in the subject dropdown (a dropdown cannot show an empty value as picked). */
const NONE = "none";
const twoDigits = onlyDigits(2);

/**
 * Gives a teacher a class from their page: a class, its section (when it has sections), a subject of it (the ones it studies first;
 * another of the school's subjects is added to it with its periods a week) and/or the class teacher post of that section. The same
 * list the timetable uses: the subject's periods are then the teacher's in the timetable. The server checks the rest (a teacher busy at
 * a period the subject is taught is refused, with the reason).
 */
export function AssignClassDialog({ teacher, onClose }: { teacher: Teacher; onClose: () => void }) {
  const classes = useGetStructureQuery().data?.data.classes ?? [];
  const subjects = useGetSubjectsQuery("active").data?.data.items ?? [];
  const [assign] = useAssignTeacherMutation();
  const [setClassTeacher] = useSetClassTeacherMutation();
  const { push } = useToast();
  const { busy, error, run } = useSave(onClose);

  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState(NONE);
  const [periods, setPeriods] = useState("");
  const [head, setHead] = useState(false);
  const [tried, setTried] = useState(false);

  const klass = classes.find((c) => c.id === classId);
  const hasSections = (klass?.sections.length ?? 0) > 0;
  const section = klass?.sections.find((s) => s.id === sectionId);
  const unitReady = !!klass && (!hasSections || !!section);
  const label = klass ? (section ? `${klass.name} - ${section.name}` : klass.name) : "";
  const studies = useGetAllotmentsQuery({ classId, sectionId: section?.id ?? null }, { skip: !unitReady }).data?.data.rows ?? [];
  const studied = new Set(studies.map((r) => r.subjectId));
  const subject = subjects.find((s) => s.id === subjectId);
  const isNew = subjectId !== NONE && unitReady && !studied.has(subjectId);
  const periodCount = Number(periods);

  const problems = {
    classId: !klass ? "Choose a class" : undefined,
    sectionId: klass && hasSections && !section ? "Choose the section" : undefined,
    subjectId: unitReady && subjectId === NONE && !head ? "Choose a subject, or make them the class teacher" : undefined,
    periods: isNew && (!Number.isInteger(periodCount) || periodCount < 1 || periodCount > MAX_PERIODS_PER_WEEK) ? `Enter the periods a week (1 to ${MAX_PERIODS_PER_WEEK})` : undefined,
  };
  const shown = (key: keyof typeof problems) => (tried ? problems[key] : undefined);
  const serverSays = (path: string) => (Array.isArray(error?.details) ? (error.details as { path?: string; message?: string }[]).find((d) => d.path === path)?.message : undefined);

  function save() {
    setTried(true);
    if (Object.values(problems).some(Boolean) || !klass) return;
    const unit = { classId: klass.id, sectionId: section?.id ?? null };
    void run(async () => {
      if (subject) await assign({ ...unit, subjectId: subject.id, teacherId: teacher.id, ...(isNew ? { periodsPerWeek: periodCount } : {}) }).unwrap();
      if (head) await setClassTeacher({ ...unit, teacherId: teacher.id }).unwrap();
      const what = [subject ? `${subject.name} of ${label}` : null, head ? `the class teacher post of ${label}` : null].filter(Boolean).join(" and ");
      push("success", `${teacher.name} is given ${what}`);
    });
  }

  // The subjects the class studies first (in its order), then the school's others.
  const subjectOptions = [
    { value: NONE, label: "No subject" },
    ...studies.map((r) => ({ value: r.subjectId, label: r.subjectName })),
    ...subjects.filter((s) => !studied.has(s.id)).map((s) => ({ value: s.id, label: s.name })),
  ];

  return (
    <AppModal
      title={`Assign a class to ${teacher.name}`}
      icon={School}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onPress={onClose} isDisabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" isPending={busy} onPress={save}>
            Assign
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="assign-class" label="Class" error={shown("classId")}>
            <Select
              id="assign-class"
              value={classId}
              placeholder="Select a class"
              invalid={!!shown("classId")}
              options={classes.map((c) => ({ value: c.id, label: c.name }))}
              onChange={(id) => {
                setClassId(id);
                setSectionId("");
                setSubjectId(NONE);
              }}
            />
          </Field>
          {hasSections && (
            <Field id="assign-section" label="Section" error={shown("sectionId")}>
              <Select
                id="assign-section"
                value={sectionId}
                placeholder="Select the section"
                invalid={!!shown("sectionId")}
                options={(klass?.sections ?? []).map((s) => ({ value: s.id, label: s.name }))}
                onChange={(id) => {
                  setSectionId(id);
                  setSubjectId(NONE);
                }}
              />
            </Field>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="assign-subject" label="Subject" quiet error={shown("subjectId") ?? serverSays("subjectId") ?? serverSays("teacherId")}>
            <Select id="assign-subject" value={subjectId} disabled={!unitReady} invalid={!!shown("subjectId")} options={subjectOptions} onChange={(id) => setSubjectId(id)} />
          </Field>
          {isNew && (
            <Field id="assign-periods" label="Periods a week" error={shown("periods") ?? serverSays("periodsPerWeek")}>
              <Input id="assign-periods" inputMode="numeric" autoComplete="off" placeholder="5" value={periods} onChange={(e) => setPeriods(twoDigits(e.target.value))} />
            </Field>
          )}
        </div>

        {unitReady && (
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-foreground">
            <input type="checkbox" className="size-4 accent-primary" checked={head} onChange={(e) => setHead(e.target.checked)} />
            Class teacher of {label}
          </label>
        )}

        <ModalError message={error && !serverSays("subjectId") && !serverSays("teacherId") && !serverSays("periodsPerWeek") ? error.message : null} />
      </div>
    </AppModal>
  );
}
