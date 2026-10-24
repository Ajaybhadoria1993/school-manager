import { CalendarDays, CalendarPlus, Cake, UserRound } from "lucide-react";
import { BLOOD_GROUPS, CATEGORIES, GENDERS, MAX_AGE, MIN_AGE } from "../../../constants/students";
import { RELIGIONS } from "../../../constants/studentFields";
import { asks, mayLeave } from "../../../utils/fieldRules";
import { fieldId, type StudentForm } from "../../../hooks/useStudentForm";
import { cn } from "../../../utils/helpers";
import { ageOn, todayInIndia } from "../../../utils/students";
import { Field } from "../../ui/Field";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";
import { ChoiceSelect } from "./ChoiceSelect";
import { FormCard } from "./FormCard";
import { FORM_GRID } from "./formGrid";

/**
 * The student, in rows of three like a new-patient form: first name, last name and gender; date of birth, admission date and the
 * age they come to (worked out, not typed); category, blood group and religion (each as the school wants it, or not asked).
 */
export function StudentFields({ form, mode, index = 0 }: { form: StudentForm; mode: "admit" | "edit"; index?: number }) {
  const { values } = form;
  const today = todayInIndia();
  const admittedOn = values.admissionDate || today;
  const age = /^\d{4}-\d{2}-\d{2}$/.test(values.dateOfBirth) ? ageOn(values.dateOfBirth, admittedOn) : null;
  const ageOk = age !== null && age >= MIN_AGE && age <= MAX_AGE;

  return (
    <FormCard
      index={index}
      icon={UserRound}
      tone="primary"
      title="Student"
      description="The child's name as it should appear on the school's records."
      tip="The admission number (for example ADM-2026-0001) is not typed: the school's counter gives the next one when you press Admit, and it never changes."
    >
      <div className={FORM_GRID}>
        <Field id={fieldId("firstName")} label="First name" error={form.errorOf("firstName")}>
          <Input {...form.bind("firstName")} maxLength={50} autoComplete="off" placeholder="For example Asha" />
        </Field>
        <Field id={fieldId("lastName")} label="Last name" error={form.errorOf("lastName")}>
          <Input {...form.bind("lastName")} maxLength={50} autoComplete="off" placeholder="For example Verma" />
        </Field>
        <Field id={fieldId("gender")} label="Gender" error={form.errorOf("gender")}>
          <Select
            id={fieldId("gender")}
            value={values.gender}
            options={GENDERS}
            placeholder="Select gender"
            invalid={!!form.errorOf("gender")}
            onChange={(g) => {
              form.set("gender", g);
              form.touch("gender");
            }}
          />
        </Field>

        <Field id={fieldId("dateOfBirth")} label="Date of birth" error={form.errorOf("dateOfBirth")} hint={`${MIN_AGE} to ${MAX_AGE} years old.`}>
          <Input {...form.bind("dateOfBirth")} type="date" icon={CalendarDays} max={today} min="1990-01-01" />
        </Field>
        {/* An admission may leave it empty (the server takes today) unless the school needs it, or not ask it at all (today); a saved
            student keeps one, so the edit form always shows it. */}
        {(mode === "edit" || asks(form.rules, "admissionDate")) && (
          <Field
            id={fieldId("admissionDate")}
            label="Admission date"
            optional={mode === "admit" && mayLeave(form.rules, "admissionDate")}
            error={form.errorOf("admissionDate")}
            hint={mode === "admit" ? "Empty is today; never in the future." : "Never in the future."}
          >
            <Input {...form.bind("admissionDate")} type="date" icon={CalendarPlus} max={today} />
          </Field>
        )}
        <div>
          <p className="mb-1.5 block text-sm font-semibold text-foreground">Age</p>
          <p
            aria-live="polite"
            className={cn(
              "flex h-10 items-center gap-2 rounded-lg border border-dashed px-3.5 text-sm",
              age === null ? "border-border text-foreground-muted" : ageOk ? "border-success-line bg-success-soft/50 font-semibold text-success" : "border-danger-line bg-danger-soft/50 font-semibold text-danger"
            )}
          >
            <Cake className="size-4 shrink-0" aria-hidden />
            {age === null ? "From the date of birth" : `${age} year${age === 1 ? "" : "s"}`}
          </p>
          <p className="mt-1.5 text-xs text-foreground-muted">On the admission date.</p>
        </div>

        {asks(form.rules, "category") && (
          <Field id={fieldId("category")} label="Category" optional={mayLeave(form.rules, "category")} error={form.errorOf("category")}>
            <ChoiceSelect form={form} path="category" options={CATEGORIES} placeholder="Select category" />
          </Field>
        )}
        {asks(form.rules, "bloodGroup") && (
          <Field id={fieldId("bloodGroup")} label="Blood group" optional={mayLeave(form.rules, "bloodGroup")} error={form.errorOf("bloodGroup")}>
            <ChoiceSelect form={form} path="bloodGroup" options={BLOOD_GROUPS} placeholder="Select blood group" />
          </Field>
        )}
        {asks(form.rules, "religion") && (
          <Field id={fieldId("religion")} label="Religion" optional={mayLeave(form.rules, "religion")} error={form.errorOf("religion")}>
            <ChoiceSelect form={form} path="religion" options={RELIGIONS} placeholder="Select religion" />
          </Field>
        )}
      </div>
    </FormCard>
  );
}
