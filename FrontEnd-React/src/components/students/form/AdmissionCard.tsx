import { CalendarPlus } from "lucide-react";
import type { StudentForm } from "../../../hooks/useStudentForm";
import { asks } from "../../../utils/fieldRules";
import { AdmissionDateField } from "./AdmissionDateField";
import { FormSection } from "./FormSection";
import { FORM_GRID } from "./formGrid";

/**
 * The admission date, in the Academic step of the admission page, when the school asks for it (the number is not typed: the school's
 * counter gives the next one when Admit is pressed). Nothing is shown when the school does not ask the date (it is today).
 */
export function AdmissionCard({ form, index = 0 }: { form: StudentForm; index?: number }) {
  if (!asks(form.rules, "admissionDate")) return null;
  return (
    <FormSection
      index={index}
      icon={CalendarPlus}
      title="Admission"
      tip="The admission number (for example ADM-2026-0001) is not typed: the school's counter gives the next one when you press Admit, and it never changes."
    >
      <div className={FORM_GRID}>
        <AdmissionDateField form={form} mode="admit" />
      </div>
    </FormSection>
  );
}
