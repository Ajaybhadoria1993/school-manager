import { CalendarPlus } from "lucide-react";
import { fieldId, type StudentForm } from "../../../hooks/useStudentForm";
import { asks, mayLeave } from "../../../utils/fieldRules";
import { todayInIndia } from "../../../utils/students";
import { Field } from "../../ui/Field";
import { Input } from "../../ui/Input";

/**
 * The admission date. An admission may leave it empty (the server takes today) unless the school needs it, or not ask it at all (today);
 * a saved student keeps one, so the edit form always shows it.
 */
export function AdmissionDateField({ form, mode }: { form: StudentForm; mode: "admit" | "edit" }) {
  if (mode === "admit" && !asks(form.rules, "admissionDate")) return null;
  return (
    <Field
      id={fieldId("admissionDate")}
      label="Admission date"
      optional={mode === "admit" && mayLeave(form.rules, "admissionDate")}
      error={form.errorOf("admissionDate")}
      hint={mode === "admit" ? "Empty is today; never in the future." : "Never in the future."}
    >
      <Input {...form.bind("admissionDate")} type="date" icon={CalendarPlus} max={todayInIndia()} />
    </Field>
  );
}
