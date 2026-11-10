import { BadgeCheck, CalendarDays, Fingerprint, School } from "lucide-react";
import type { FormFieldKey, MovableKey } from "../../../constants/studentFields";
import { fieldId, type StudentForm } from "../../../hooks/useStudentForm";
import { asks, mayLeave } from "../../../utils/fieldRules";
import { todayInIndia } from "../../../utils/students";
import { Field } from "../../ui/Field";
import { Input } from "../../ui/Input";
import { FieldBox } from "./FieldBox";
import { FormSection } from "./FormSection";
import { FORM_GRID } from "./formGrid";

/** One box of a record: shown when the school asks for it, "optional" in its label when it may be left empty. */
function RecordBox({
  form,
  rule,
  path,
  label,
  placeholder,
  maxLength,
}: {
  form: StudentForm;
  rule: FormFieldKey;
  path: string;
  label: string;
  placeholder?: string;
  maxLength: number;
}) {
  if (!asks(form.rules, rule)) return null;
  return (
    <Field id={fieldId(path)} label={label} optional={mayLeave(form.rules, rule)} error={form.errorOf(path)}>
      <Input {...form.bind(path)} maxLength={maxLength} autoComplete="off" placeholder={placeholder} />
    </Field>
  );
}

const ID_RULES: MovableKey[] = ["aadhaarNumber", "samagraId", "apaarId", "pen", "srNumber"];

/** The student's government and school IDs: Aadhaar, Samagra (Madhya Pradesh), APAAR, PEN (UDISE+) and the old register's number. */
export function IdFields({ form, index = 0 }: { form: StudentForm; index?: number }) {
  if (!ID_RULES.some((k) => asks(form.rules, k))) return null;
  return (
    <FormSection
      index={index}
      icon={Fingerprint}
      title="IDs and records"
      tip="Aadhaar is checked as you type (12 digits with its check digit) and is kept once per student: a number already in your school is refused, with whose it is."
    >
      <div className={FORM_GRID}>
        {ID_RULES.map((rule) => (
          <FieldBox key={rule} form={form} rule={rule} />
        ))}
      </div>
    </FormSection>
  );
}

/**
 * Where the student studied before: the school, the last class there and the transfer certificate. A TC or a last class means nothing
 * without the school's name, so a school that does not ask for the name gets no card at all.
 */
export function PreviousSchoolFields({ form, index = 0 }: { form: StudentForm; index?: number }) {
  const r = form.rules;
  if (!asks(r, "previousSchoolName")) return null;
  // Needed for a student of Class 1 to 12, and not before it (Nursery, LKG, UKG): the class chosen decides.
  const needed = !mayLeave(r, "previousSchoolName");
  return (
    <FormSection
      index={index}
      icon={School}
      title="Previous school"
    >
      <div className={FORM_GRID}>
        <RecordBox form={form} rule="previousSchoolName" path="previousSchool.name" label="School name" maxLength={150} />
        <RecordBox form={form} rule="previousSchoolLastClass" path="previousSchool.lastClass" label="Last class there" placeholder="Class 4" maxLength={40} />
        <RecordBox form={form} rule="previousSchoolTcNumber" path="previousSchool.tcNumber" label="TC number" maxLength={40} />
        {asks(r, "previousSchoolTcDate") && (
          <Field id={fieldId("previousSchool.tcDate")} label="TC date" optional={mayLeave(r, "previousSchoolTcDate")} error={form.errorOf("previousSchool.tcDate")}>
            <Input {...form.bind("previousSchool.tcDate")} type="date" icon={CalendarDays} max={todayInIndia()} />
          </Field>
        )}
      </div>
      {needed && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-foreground-muted">
          <BadgeCheck className="size-3.5 text-success" aria-hidden />
          A student of Class 1 to 12 always has a previous school. Nursery, LKG and UKG do not need one.
        </p>
      )}
    </FormSection>
  );
}
