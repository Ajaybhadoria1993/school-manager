import { useState } from "react";
import { UserX } from "lucide-react";
import { useDeactivateStudentsMutation } from "../../../redux/api/studentsApi";
import { namesPreview } from "../../../utils/students";
import { ConfirmModal } from "../../classes/ConfirmModal";
import { Field } from "../../ui/Field";
import { Input } from "../../ui/Input";
import { useToast } from "../../ui/toast-context";

/** The longest reason the server keeps (MAX_STATUS_REASON). */
const MAX_REASON = 200;

/**
 * "Make inactive?" for one student or many: a student who left the school (or was admitted by mistake) goes out of the list, the
 * seats and the Excel, and nothing is deleted. The person may say why (kept with who did it and when). One request; if it fails the
 * reason is shown in the dialog.
 */
export function DeactivateDialog({
  students,
  onClose,
  onDone,
}: {
  students: { id: string; name: string; admissionNumber: string }[];
  onClose: () => void;
  onDone?: () => void;
}) {
  const [reason, setReason] = useState("");
  const [deactivate] = useDeactivateStudentsMutation();
  const { push } = useToast();
  const one = students.length === 1 ? students[0] : null;

  return (
    <ConfirmModal
      title={one ? `Make ${one.name} inactive?` : `Make ${students.length} students inactive?`}
      icon={UserX}
      tone="primary"
      confirmLabel="Make inactive"
      onClose={onClose}
      onConfirm={async () => {
        const res = await deactivate({ ids: students.map((s) => s.id), ...(reason.trim() ? { reason: reason.trim() } : {}) }).unwrap();
        push("success", res.message ?? "Made inactive");
        onDone?.();
      }}
    >
      <p>{one ? `${one.name} (${one.admissionNumber})` : namesPreview(students.map((s) => s.name))}</p>
      <p>
        They leave the list, the seat counts and the Excel export, as if they were not in the school. Nothing is deleted: their record is kept, and one click
        on the Inactive students tab makes them active again. The record keeps who did this and when.
      </p>
      <Field id="inactive-reason" label="Why" optional>
        <Input id="inactive-reason" value={reason} maxLength={MAX_REASON} placeholder="For example: left the school, transferred, admitted by mistake" onChange={(e) => setReason(e.target.value)} />
      </Field>
    </ConfirmModal>
  );
}
