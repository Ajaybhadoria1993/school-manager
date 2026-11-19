import { BookOpen, Briefcase, Hash, Home, KeyRound, Mail, Phone, User, UserRound } from "lucide-react";
import { DESIGNATIONS, EMPLOYMENT_OPTIONS, TEACHER_LIMITS } from "../../constants/teachers";
import { STATES } from "../../constants/schoolOptions";
import { GENDERS } from "../../constants/students";
import { teacherFieldId, type TeacherForm } from "../../hooks/useTeacherForm";
import type { UsernameStatus } from "../../hooks/useUsernameCheck";
import { birthDateRange, generatePassword, jobAsked, joiningShortcuts, latestJoiningDate, onlyDigits } from "../../utils/teachers";
import { mobileDigits, todayInIndia } from "../../utils/students";
import { FormCard } from "../students/form/FormCard";
import { ChipPicker } from "../ui/ChipPicker";
import { DateBox } from "../ui/DateBox";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { SearchSelect } from "../ui/SearchSelect";
import { Select } from "../ui/Select";
import { DayChips } from "../timetable/DayChips";
import { PasswordBox } from "./PasswordBox";
import { SubjectChips } from "./SubjectChips";
import { UsernameState } from "./UsernameState";

/**
 * The boxes of a teacher, one card for each kind of detail. Add teacher puts them on its steps, Change teacher puts the first three on
 * one page. A box shows the star when it is needed and "(optional)" when it is not; `needed` says which of the two a box is on the
 * form that shows it (a teacher who is added needs a gender and a mobile number, one who is only changed does not).
 */

/** Three boxes to a row on a laptop, two on a tablet, one on a phone: the page is as wide as the screen allows. */
export const TEACHER_GRID = "grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3";

const twoDigits = onlyDigits(2);

export function PersonalFields({ form, needed, genderNeeded = needed, index = 0 }: { form: TeacherForm; needed: boolean; genderNeeded?: boolean; index?: number }) {
  const { values, rules } = form;
  const born = birthDateRange(todayInIndia());
  const addressAsked = (["address", "city", "state", "pincode"] as const).some((k) => rules[k] !== "hidden");
  return (
    <>
      <FormCard index={index} icon={UserRound} tone="primary" title="Teacher">
        <div className={TEACHER_GRID}>
          <Field id={teacherFieldId("name")} label="Name" error={form.errorOf("name")}>
            <Input {...form.bind("name")} maxLength={TEACHER_LIMITS.name} autoComplete="off" placeholder="For example Meena Singh" />
          </Field>
          <Field id={teacherFieldId("gender")} label="Gender" optional={!genderNeeded} error={form.errorOf("gender")}>
            <ChipPicker
              label="Gender"
              value={values.gender}
              options={GENDERS.map((g) => ({ value: g, label: g }))}
              onChange={(g) => {
                form.set("gender", g as typeof values.gender);
                form.reveal(["gender"]);
              }}
            />
          </Field>
          {rules.dateOfBirth !== "hidden" && (
          <Field id={teacherFieldId("dateOfBirth")} label="Date of birth" optional={rules.dateOfBirth !== "required"} error={form.errorOf("dateOfBirth")}>
            <DateBox
              id={teacherFieldId("dateOfBirth")}
              label="Date of birth"
              value={values.dateOfBirth}
              onChange={(day) => form.set("dateOfBirth", day)}
              onBlur={() => form.reveal(["dateOfBirth"])}
              min={born.min}
              max={born.max}
              invalid={form.errorOf("dateOfBirth") !== undefined}
            />
          </Field>
          )}
          <Field id={teacherFieldId("mobile")} label="Mobile number" optional={!needed} error={form.errorOf("mobile")}>
            <Input {...form.bind("mobile", mobileDigits)} icon={Phone} prefix="+91" type="tel" inputMode="numeric" autoComplete="off" placeholder="98765 43210" />
          </Field>
          {rules.email !== "hidden" && (
            <Field id={teacherFieldId("email")} label="Email" optional={rules.email !== "required"} error={form.errorOf("email")}>
              <Input {...form.bind("email")} icon={Mail} type="email" maxLength={254} autoComplete="off" placeholder="meena@example.com" />
            </Field>
          )}
        </div>
      </FormCard>

      {/* autoComplete off: the browser would fill in the address of the person typing, not the teacher's. */}
      {addressAsked && (
        <FormCard index={index + 1} icon={Home} tone="info" title="Address">
          <div className={TEACHER_GRID}>
            {rules.address !== "hidden" && (
              <Field id={teacherFieldId("addressLine1")} label="House and street" optional={rules.address !== "required"} error={form.errorOf("addressLine1")}>
                <Input {...form.bind("addressLine1")} icon={Home} maxLength={200} autoComplete="off" placeholder="12, MG Road" />
              </Field>
            )}
            {rules.city !== "hidden" && (
              <Field id={teacherFieldId("city")} label="City or village" optional={rules.city !== "required"} error={form.errorOf("city")}>
                <Input {...form.bind("city")} maxLength={80} autoComplete="off" />
              </Field>
            )}
            {rules.state !== "hidden" && (
              <Field id={teacherFieldId("state")} label="State" optional={rules.state !== "required"} error={form.errorOf("state")}>
                <Select id={teacherFieldId("state")} value={values.state} options={STATES} placeholder="Choose the state" onChange={(s) => form.set("state", s)} />
              </Field>
            )}
            {rules.pincode !== "hidden" && (
              <Field id={teacherFieldId("pincode")} label="PIN code" optional={rules.pincode !== "required"} error={form.errorOf("pincode")}>
                <Input {...form.bind("pincode", onlyDigits(6))} icon={Hash} inputMode="numeric" autoComplete="off" placeholder="6 digits" />
              </Field>
            )}
          </div>
        </FormCard>
      )}
    </>
  );
}

export function JobFields({ form, index = 0 }: { form: TeacherForm; index?: number }) {
  const { values, rules } = form;
  if (!jobAsked(rules)) return null;
  // A post typed by hand is one of the choices from then on.
  const posts = values.designation && !(DESIGNATIONS as readonly string[]).includes(values.designation) ? [values.designation, ...DESIGNATIONS] : [...DESIGNATIONS];
  return (
    <FormCard index={index} icon={Briefcase} tone="navy" title="Job">
      <div className={TEACHER_GRID}>
        {rules.employeeCode !== "hidden" && (
          <Field id={teacherFieldId("employeeCode")} label="Employee code" optional={rules.employeeCode !== "required"} error={form.errorOf("employeeCode")}>
            <Input {...form.bind("employeeCode")} icon={Hash} maxLength={TEACHER_LIMITS.employeeCode} autoComplete="off" placeholder="T-014" />
          </Field>
        )}
        {rules.designation !== "hidden" && (
        <Field id={teacherFieldId("designation")} label="Designation" optional={rules.designation !== "required"} error={form.errorOf("designation")}>
          <SearchSelect
            id={teacherFieldId("designation")}
            value={values.designation}
            options={posts.map((p) => ({ value: p, label: p }))}
            placeholder="Choose or type a post"
            onChange={(d) => form.set("designation", d)}
            create={{ idle: "Type another post…", typed: (text) => `Use “${text}”`, onCreate: (text) => form.set("designation", text.trim().slice(0, TEACHER_LIMITS.designation)) }}
          />
        </Field>
        )}
        {rules.qualification !== "hidden" && (
          <Field id={teacherFieldId("qualification")} label="Qualification" optional={rules.qualification !== "required"} error={form.errorOf("qualification")}>
            <Input {...form.bind("qualification")} maxLength={TEACHER_LIMITS.qualification} placeholder="M.Sc., B.Ed." />
          </Field>
        )}
        {rules.employmentType !== "hidden" && (
        <Field id={teacherFieldId("employmentType")} label="Employment type" optional={rules.employmentType !== "required"} error={form.errorOf("employmentType")}>
          <ChipPicker
            label="Employment type"
            value={values.employmentType}
            options={EMPLOYMENT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            onChange={(t) => form.set("employmentType", t as typeof values.employmentType)}
          />
        </Field>
        )}
        {rules.joiningDate !== "hidden" && (
        <Field id={teacherFieldId("joiningDate")} label="Joining date" optional={rules.joiningDate !== "required"} error={form.errorOf("joiningDate")}>
          <DateBox
            id={teacherFieldId("joiningDate")}
            label="Joining date"
            value={values.joiningDate}
            onChange={(day) => form.set("joiningDate", day)}
            onBlur={() => form.reveal(["joiningDate"])}
            min="1960-01-01"
            max={latestJoiningDate()}
            invalid={form.errorOf("joiningDate") !== undefined}
            shortcuts={joiningShortcuts(todayInIndia())}
          />
        </Field>
        )}
        {rules.experienceYears !== "hidden" && (
          <Field id={teacherFieldId("experienceYears")} label="Experience (years)" optional={rules.experienceYears !== "required"} error={form.errorOf("experienceYears")}>
            <Input {...form.bind("experienceYears", twoDigits)} inputMode="numeric" autoComplete="off" placeholder="5" />
          </Field>
        )}
      </div>
    </FormCard>
  );
}

export function TeachingFields({ form, index = 0 }: { form: TeacherForm; index?: number }) {
  const { values, rules } = form;
  return (
    <FormCard index={index} icon={BookOpen} tone="success" title="Teaching">
      <div className="space-y-5">
        {rules.subjects !== "hidden" && (
          <div>
            <p className="mb-1.5 text-sm font-semibold text-foreground">
              Subjects they can teach {rules.subjects === "required" ? <span className="text-danger">*</span> : <span className="font-normal text-foreground-muted">(optional)</span>}
            </p>
            <SubjectChips value={values.subjectIds} onChange={(ids) => form.set("subjectIds", ids)} />
            {form.errorOf("subjectIds") && <p role="alert" className="mt-1.5 text-xs font-medium text-danger">{form.errorOf("subjectIds")}</p>}
          </div>
        )}

        <div className={TEACHER_GRID}>
          <Field id={teacherFieldId("maxPeriodsPerDay")} label="Most periods a day" optional error={form.errorOf("maxPeriodsPerDay")}>
            <Input {...form.bind("maxPeriodsPerDay", twoDigits)} inputMode="numeric" autoComplete="off" placeholder="6" />
          </Field>
          <Field id={teacherFieldId("maxPeriodsPerWeek")} label="Most periods a week" optional error={form.errorOf("maxPeriodsPerWeek")}>
            <Input {...form.bind("maxPeriodsPerWeek", twoDigits)} inputMode="numeric" autoComplete="off" placeholder="30" />
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-semibold text-foreground">
              Days off <span className="font-normal text-foreground-muted">(optional)</span>
            </p>
            <DayChips label="Days off" tone="off" value={values.offDays} onChange={(days) => form.set("offDays", days)} />
            {form.errorOf("offDays") && <p role="alert" className="mt-1.5 text-xs font-medium text-danger">{form.errorOf("offDays")}</p>}
          </div>
        </div>
      </div>
    </FormCard>
  );
}

/**
 * A username and a first password. The password is shown, not hidden: the school is making it for someone else and gives it to them.
 * Under the username: whether it is free on the platform (`check`), and when it is taken, free ones to take in one click.
 */
export function LoginFields({ form, check, index = 0 }: { form: TeacherForm; check: UsernameStatus; index?: number }) {
  const error = form.errorOf("username");
  const taken = !error && check.state === "taken";
  return (
    <FormCard index={index} icon={KeyRound} tone="warning" title="Login">
      <div className={TEACHER_GRID}>
        <Field id={teacherFieldId("username")} label="Username" error={error}>
          <Input
            {...form.bind("username")}
            aria-invalid={error !== undefined || taken ? true : undefined}
            aria-describedby={error ? `${teacherFieldId("username")}-error` : taken ? "username-taken" : undefined}
            icon={User}
            maxLength={30}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          {!error && <UsernameState check={check} onPick={(name) => form.set("username", name, true)} />}
        </Field>
        <Field id={teacherFieldId("password")} label="Password" error={form.errorOf("password")}>
          <PasswordBox {...form.bind("password")} onMakeAnother={() => form.set("password", generatePassword())} />
        </Field>
      </div>
    </FormCard>
  );
}
