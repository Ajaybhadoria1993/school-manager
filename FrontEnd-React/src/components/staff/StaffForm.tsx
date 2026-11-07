import { Briefcase, Hash, Home, Mail, Phone, UserRound } from "lucide-react";
import { STAFF_ROLES } from "../../constants/staffMembers";
import { STATES } from "../../constants/schoolOptions";
import { TEACHER_LIMITS } from "../../constants/teachers";
import { staffFieldId, type StaffFormKey, type StaffFormValues, type StaffProblems } from "../../utils/staffMembers";
import { birthDateRange, joiningShortcuts, latestJoiningDate, onlyDigits } from "../../utils/teachers";
import { mobileDigits, todayInIndia } from "../../utils/students";
import { FormCard } from "../students/form/FormCard";
import { ChipPicker } from "../ui/ChipPicker";
import { DateBox } from "../ui/DateBox";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";

/** Three boxes to a row on a laptop, two on a tablet, one on a phone. */
const GRID = "grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3";
const GENDERS = ["Male", "Female", "Other"] as const;

/**
 * The boxes of a staff member in two cards: the role and the job (what the person is invited as), and the person (name, the email the
 * invitation goes to, and the rest, all optional). `editing`: the email is shown but fixed (the login is made from it). A box says what is
 * wrong under it once `errors` has a message for it; nothing is sent from here.
 */
export function StaffForm({
  values,
  errors,
  onChange,
  onReveal,
  editing = false,
}: {
  values: StaffFormValues;
  errors: StaffProblems;
  onChange: <K extends StaffFormKey>(key: K, value: StaffFormValues[K]) => void;
  /** A box was left: its message may show. */
  onReveal: (key: StaffFormKey) => void;
  editing?: boolean;
}) {
  const role = STAFF_ROLES.find((r) => r.key === values.role);
  const born = birthDateRange(todayInIndia());
  const text = (key: Exclude<StaffFormKey, "gender" | "role" | "state" | "dateOfBirth" | "joiningDate">, keep?: (typed: string) => string) => ({
    id: staffFieldId(key),
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(key, (keep ? keep(e.target.value) : e.target.value) as never),
    onBlur: () => onReveal(key),
    "aria-invalid": errors[key] !== undefined ? true : undefined,
    "aria-describedby": errors[key] !== undefined ? `${staffFieldId(key)}-error` : undefined,
  });

  return (
    <>
      <FormCard index={0} icon={Briefcase} tone="navy" title="Role">
        <div className={GRID}>
          <Field id={staffFieldId("role")} label="Role" error={errors.role}>
            <Select
              id={staffFieldId("role")}
              value={values.role}
              placeholder="Choose the role"
              invalid={errors.role !== undefined}
              options={STAFF_ROLES.map((r) => ({ value: r.key, label: r.label }))}
              onChange={(next) => onChange("role", next)}
            />
          </Field>
          <Field id={staffFieldId("designation")} label="Designation" optional error={errors.designation}>
            <Input {...text("designation")} maxLength={TEACHER_LIMITS.designation} autoComplete="off" placeholder="For example Front desk" />
          </Field>
          <Field id={staffFieldId("employeeCode")} label="Employee code" optional error={errors.employeeCode}>
            <Input {...text("employeeCode")} icon={Hash} maxLength={TEACHER_LIMITS.employeeCode} autoComplete="off" placeholder="S-014" />
          </Field>
          <Field id={staffFieldId("joiningDate")} label="Joining date" optional error={errors.joiningDate}>
            <DateBox
              id={staffFieldId("joiningDate")}
              label="Joining date"
              value={values.joiningDate}
              onChange={(day) => onChange("joiningDate", day)}
              onBlur={() => onReveal("joiningDate")}
              min="1960-01-01"
              max={latestJoiningDate()}
              invalid={errors.joiningDate !== undefined}
              shortcuts={joiningShortcuts(todayInIndia())}
            />
          </Field>
        </div>
        {role && <p className="mt-3 text-sm text-foreground-muted">{role.description}</p>}
      </FormCard>

      <FormCard index={1} icon={UserRound} tone="primary" title="Staff member">
        <div className={GRID}>
          <Field id={staffFieldId("name")} label="Name" error={errors.name}>
            <Input {...text("name")} maxLength={TEACHER_LIMITS.name} autoComplete="off" placeholder="For example Asha Rao" />
          </Field>
          <Field id={staffFieldId("email")} label="Email" error={errors.email}>
            <Input {...text("email")} icon={Mail} type="email" autoComplete="off" disabled={editing} placeholder="asha@school.example" />
          </Field>
          <Field id={staffFieldId("mobile")} label="Mobile number" optional error={errors.mobile}>
            <Input {...text("mobile", mobileDigits)} icon={Phone} prefix="+91" type="tel" inputMode="numeric" autoComplete="off" placeholder="98765 43210" />
          </Field>
          <Field id={staffFieldId("gender")} label="Gender" optional error={errors.gender}>
            <ChipPicker label="Gender" value={values.gender} options={GENDERS.map((g) => ({ value: g, label: g }))} onChange={(g) => onChange("gender", g as StaffFormValues["gender"])} />
          </Field>
          <Field id={staffFieldId("dateOfBirth")} label="Date of birth" optional error={errors.dateOfBirth}>
            <DateBox
              id={staffFieldId("dateOfBirth")}
              label="Date of birth"
              value={values.dateOfBirth}
              onChange={(day) => onChange("dateOfBirth", day)}
              onBlur={() => onReveal("dateOfBirth")}
              min={born.min}
              max={born.max}
              invalid={errors.dateOfBirth !== undefined}
            />
          </Field>
        </div>
      </FormCard>

      <FormCard index={2} icon={Home} tone="success" title="Address">
        <div className={GRID}>
          <Field id={staffFieldId("addressLine1")} label="Address" optional error={errors.addressLine1} className="sm:col-span-2 lg:col-span-3">
            <Input {...text("addressLine1")} maxLength={200} autoComplete="off" placeholder="House, street and area" />
          </Field>
          <Field id={staffFieldId("city")} label="City or village" optional error={errors.city}>
            <Input {...text("city")} maxLength={80} autoComplete="off" />
          </Field>
          <Field id={staffFieldId("state")} label="State" optional error={errors.state}>
            <Select id={staffFieldId("state")} value={values.state} options={STATES} placeholder="Choose the state" onChange={(s) => onChange("state", s)} />
          </Field>
          <Field id={staffFieldId("pincode")} label="PIN code" optional error={errors.pincode}>
            <Input {...text("pincode", onlyDigits(6))} inputMode="numeric" autoComplete="off" placeholder="462001" />
          </Field>
        </div>
      </FormCard>
    </>
  );
}
