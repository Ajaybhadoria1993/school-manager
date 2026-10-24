import { BadgeCheck, CalendarDays, Fingerprint, School } from "lucide-react";
import type { FormFieldKey } from "../../../constants/studentFields";
import { fieldId, type StudentForm } from "../../../hooks/useStudentForm";
import { asks, mayLeave } from "../../../utils/fieldRules";
import { todayInIndia } from "../../../utils/students";
import { Field } from "../../ui/Field";
import { Input } from "../../ui/Input";
import { FormCard } from "./FormCard";
import { FORM_GRID } from "./formGrid";

/** One box of a record: shown when the school asks for it, "optional" in its label when it may be left empty. */
function RecordBox({
  form,
  rule,
  path,
  label,
  placeholder,
  maxLength,
  numeric,
}: {
  form: StudentForm;
  rule: FormFieldKey;
  path: string;
  label: string;
  placeholder?: string;
  maxLength: number;
  numeric?: boolean;
}) {
  if (!asks(form.rules, rule)) return null;
  return (
    <Field id={fieldId(path)} label={label} optional={mayLeave(form.rules, rule)} error={form.errorOf(path)}>
      <Input {...form.bind(path)} maxLength={maxLength} inputMode={numeric ? "numeric" : undefined} autoComplete="off" placeholder={placeholder} />
    </Field>
  );
}

const ID_RULES: FormFieldKey[] = ["aadhaarNumber", "samagraId", "apaarId", "pen", "srNumber"];

/** The student's government and school IDs: Aadhaar, Samagra (Madhya Pradesh), APAAR, PEN (UDISE+) and the old register's number. */
export function IdFields({ form, index = 0 }: { form: StudentForm; index?: number }) {
  if (!ID_RULES.some((k) => asks(form.rules, k))) return null;
  return (
    <FormCard
      index={index}
      icon={Fingerprint}
      tone="navy"
      title="IDs and records"
      description="Aadhaar and the IDs that scholarships, UDISE+ and the state portals ask for."
      tip="Aadhaar is checked as you type (12 digits with its check digit) and is kept once per student: a number already in your school is refused, with whose it is."
    >
      <div className={FORM_GRID}>
        <RecordBox form={form} rule="aadhaarNumber" path="aadhaarNumber" label="Aadhaar number" placeholder="1234 5678 9012" maxLength={14} numeric />
        <RecordBox form={form} rule="samagraId" path="samagraId" label="Samagra ID" placeholder="8 or 9 digits" maxLength={9} numeric />
        <RecordBox form={form} rule="apaarId" path="apaarId" label="APAAR ID" placeholder="12 digits" maxLength={12} numeric />
        <RecordBox form={form} rule="pen" path="pen" label="PEN (UDISE+)" placeholder="11 digits" maxLength={11} numeric />
        <RecordBox form={form} rule="srNumber" path="srNumber" label="SR / Scholar number" placeholder="From the old register" maxLength={30} />
      </div>
    </FormCard>
  );
}

/**
 * Where the student studied before: the school, the last class there and the transfer certificate. A TC or a last class means nothing
 * without the school's name, so a school that does not ask for the name gets no card at all.
 */
export function PreviousSchoolFields({ form, index = 0 }: { form: StudentForm; index?: number }) {
  const r = form.rules;
  if (!asks(r, "previousSchoolName")) return null;
  const firstSchool = !mayLeave(r, "previousSchoolName");
  return (
    <FormCard
      index={index}
      icon={School}
      tone="success"
      title="Previous school"
      description={firstSchool ? "The school the student comes from and the transfer certificate." : "Only when the student comes from another school."}
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
      {firstSchool && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-foreground-muted">
          <BadgeCheck className="size-3.5 text-success" aria-hidden />
          Your school needs these. A child's first school? Turn Mandatory off for them on Students &gt; Export.
        </p>
      )}
    </FormCard>
  );
}
