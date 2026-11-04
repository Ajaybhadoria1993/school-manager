import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Button } from "@heroui/react";
import { useGetStructureQuery } from "../../../redux/api/academicsApi";
import { useMoveStudentMutation, useTransferOutStudentMutation } from "../../../redux/api/studentsApi";
import { MAX_ROLL_NUMBER } from "../../../constants/students";
import { cn } from "../../../utils/helpers";
import { todayInIndia } from "../../../utils/students";
import type { StudentDetail } from "../../../types";
import { useSave } from "../../classes/useSave";
import { AppModal, ModalError } from "../../ui/AppModal";
import { Field } from "../../ui/Field";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";
import { useToast } from "../../ui/toast-context";

type Kind = "place" | "school";
const NONE = "none";

/**
 * "Transfer": a student goes to another class or section of this school, or to another school. Nothing is deleted either way: a move
 * is written into the student's history (where from, where to, who, when, why), and a transfer to another school makes them inactive
 * with the transfer certificate kept. A full section is said and can be gone over only with the person's yes (Transfer anyway). The
 * new school needs only its name; the certificate's number and day and a remark are kept when given.
 */
export function TransferDialog({ student, onClose }: { student: StudentDetail; onClose: () => void }) {
  const structureRes = useGetStructureQuery();
  const [move] = useMoveStudentMutation();
  const [transferOut] = useTransferOutStudentMutation();
  const { push } = useToast();
  const { busy, error, run } = useSave(onClose);
  const [kind, setKind] = useState<Kind>("place");

  // Another class or section.
  const [classId, setClassId] = useState(student.place?.classId ?? "");
  const [sectionId, setSectionId] = useState(student.place?.sectionId ?? "");
  const [roll, setRoll] = useState("");
  const [reason, setReason] = useState("");
  // Another school.
  const [schoolName, setSchoolName] = useState("");
  const [tcNumber, setTcNumber] = useState("");
  const [tcDate, setTcDate] = useState("");
  const [remarks, setRemarks] = useState("");

  const [problem, setProblem] = useState<{ field: string; message: string } | null>(null);
  const classes = structureRes.data?.data.classes ?? [];
  const klass = classes.find((c) => c.id === classId);

  async function send(allowOverCapacity: boolean) {
    setProblem(null);
    if (kind === "school") {
      if (schoolName.trim().length < 2) return setProblem({ field: "schoolName", message: "Enter the name of the new school" });
      await run(async () => {
        const res = await transferOut({
          id: student.id,
          schoolName: schoolName.trim(),
          ...(tcNumber.trim() ? { tcNumber: tcNumber.trim() } : {}),
          ...(tcDate ? { tcDate } : {}),
          ...(remarks.trim() ? { remarks: remarks.trim() } : {}),
        }).unwrap();
        push("success", res.message ?? "Transferred to another school");
      });
      return;
    }
    if (!klass) return setProblem({ field: "classId", message: "Choose the class" });
    if (klass.sections.length > 0 && !sectionId) return setProblem({ field: "sectionId", message: "Choose the section" });
    const rollNumber = roll.trim() ? Number(roll) : null;
    if (rollNumber !== null && (!Number.isInteger(rollNumber) || rollNumber < 1 || rollNumber > MAX_ROLL_NUMBER)) {
      return setProblem({ field: "roll", message: `The roll number is 1 to ${MAX_ROLL_NUMBER}` });
    }
    if (klass.id === student.place?.classId && (sectionId || null) === (student.place?.sectionId ?? null) && rollNumber === null) {
      return setProblem({ field: "classId", message: "Choose a different class or section" });
    }
    await run(async () => {
      const res = await move({
        id: student.id,
        classId: klass.id,
        ...(sectionId ? { sectionId } : {}),
        ...(rollNumber !== null ? { rollNumber } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(allowOverCapacity ? { allowOverCapacity: true } : {}),
      }).unwrap();
      push("success", res.message ?? "Transferred");
    });
  }

  const full = error?.code === "SECTION_FULL";

  return (
    <AppModal
      title={`Transfer ${student.name}`}
      icon={ArrowRightLeft}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onPress={onClose} isDisabled={busy}>
            Cancel
          </Button>
          {full && (
            <Button variant="secondary" isPending={busy} onPress={() => void send(true)}>
              Transfer anyway
            </Button>
          )}
          <Button variant="primary" isPending={busy} onPress={() => void send(false)}>
            Transfer student
          </Button>
        </>
      }
    >
      <div role="radiogroup" aria-label="Where to" className="grid gap-2 sm:grid-cols-2">
        {([
          { value: "place", label: "Another class or section", hint: "In this school, this year" },
          { value: "school", label: "Another school", hint: "Leaves with a transfer certificate" },
        ] as const).map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors",
              kind === o.value ? "border-primary bg-primary-soft/50 ring-1 ring-primary" : "border-border bg-surface hover:border-primary/50"
            )}
          >
            <input type="radio" name="transfer-kind" aria-label={o.label} value={o.value} checked={kind === o.value} onChange={() => (setKind(o.value), setProblem(null))} aria-describedby={`transfer-${o.value}-hint`} className="mt-1 accent-primary" />
            <span>
              <span className="block text-sm font-bold text-foreground">{o.label}</span>
              <span id={`transfer-${o.value}-hint`} className="block text-xs text-foreground-muted">
                {o.hint}
              </span>
            </span>
          </label>
        ))}
      </div>

      {kind === "place" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="transfer-class" label="Class" error={problem?.field === "classId" ? problem.message : undefined}>
            <Select
              id="transfer-class"
              aria-label="Class"
              value={classId}
              options={classes.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Pick the class"
              onChange={(id) => {
                setClassId(id);
                setSectionId("");
              }}
            />
          </Field>
          <Field id="transfer-section" label="Section" optional={!klass || klass.sections.length === 0} error={problem?.field === "sectionId" ? problem.message : undefined}>
            <Select
              id="transfer-section"
              aria-label="Section"
              value={sectionId || (klass && klass.sections.length === 0 ? NONE : "")}
              options={klass && klass.sections.length > 0 ? klass.sections.map((s) => ({ value: s.id, label: `Section ${s.name}` })) : [{ value: NONE, label: "No sections" }]}
              disabled={!klass || klass.sections.length === 0}
              placeholder="Pick the section"
              onChange={(id) => setSectionId(id === NONE ? "" : id)}
            />
          </Field>
          <Field id="transfer-roll" label="Roll number" optional hint="Leave it empty to give none (a roll number is per section)." error={problem?.field === "roll" ? problem.message : undefined}>
            <Input id="transfer-roll" inputMode="numeric" maxLength={3} value={roll} onChange={(e) => setRoll(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field id="transfer-reason" label="Reason" optional>
            <Input id="transfer-reason" maxLength={200} placeholder="For example: parents asked for the morning section" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="transfer-school" label="Name of the new school" error={problem?.field === "schoolName" ? problem.message : undefined} className="sm:col-span-2">
            <Input id="transfer-school" maxLength={150} value={schoolName} onChange={(e) => setSchoolName(e.target.value)} />
          </Field>
          <Field id="transfer-tc-number" label="TC number" optional>
            <Input id="transfer-tc-number" maxLength={40} value={tcNumber} onChange={(e) => setTcNumber(e.target.value)} />
          </Field>
          <Field id="transfer-tc-date" label="TC date" optional>
            <Input id="transfer-tc-date" type="date" max={todayInIndia()} value={tcDate} onChange={(e) => setTcDate(e.target.value)} />
          </Field>
          <Field id="transfer-remarks" label="Remarks" optional className="sm:col-span-2">
            <Input id="transfer-remarks" maxLength={200} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
          <p className="text-xs text-foreground-muted sm:col-span-2">
            {student.name} becomes inactive with these details kept. Nothing is deleted: their record, their class history and their parents stay, and Make active brings them back.
          </p>
        </div>
      )}

      <ModalError message={error?.message ?? null} />
    </AppModal>
  );
}
