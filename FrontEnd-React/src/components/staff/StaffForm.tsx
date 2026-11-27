import { useState } from "react";
import { Briefcase, Hash, Home, Mail, Phone, UserRound } from "lucide-react";
import { useGetRoleChoicesQuery } from "../../redux/api/permissionsApi";
import { MAX_ROLE_OTHER, ROLES_KEEPING_THEIR_LOGIN, STAFF_ROLES } from "../../constants/staffMembers";
import { STATES } from "../../constants/schoolOptions";
import { TEACHER_LIMITS } from "../../constants/teachers";
import { namedRoleKey, staffFieldId, type StaffFormKey, type StaffFormValues, type StaffProblems } from "../../utils/staffMembers";
import { birthDateRange, joiningShortcuts, latestJoiningDate, onlyDigits } from "../../utils/teachers";
import { ageOn, ageText, mobileDigits, todayInIndia } from "../../utils/students";
import { LoginAccessBox } from "../logins/LoginAccessBox";
import { SubjectChips } from "../teachers/SubjectChips";
import { FormCard } from "../students/form/FormCard";
import { ChipPicker } from "../ui/ChipPicker";
import { DateBox } from "../ui/DateBox";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Switch } from "../ui/Switch";

/** Three boxes to a row on a laptop, two on a tablet, one on a phone. */
const GRID = "grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3";
const GENDERS = ["Male", "Female", "Other"] as const;

type TextKey = Exclude<StaffFormKey, "gender" | "role" | "state" | "dateOfBirth" | "joiningDate" | "alsoTeacher" | "subjectIds" | "giveLogin">;

/**
 * The boxes of a staff member in cards, in the order the school asked for (2026-11-08): the person (name, date of birth with the age it
 * makes, gender, mobile, the email and, when a person is added, **Give login access** (2026-11-26: ticked, the email is needed and becomes
 * their login, with an invitation to choose a password; the school makes no username or password)), the address, the role (the role, the
 * name of a role of the school's own for Other, whether they also teach and what, the designation, the employee code and the joining date).
 * `editing`: no login access box (the Staff list gives it). `teachingLocked`: the person already teaches here, so *Also a teacher* stays on
 * (they stop as a teacher on the Teacher page). A box says what is wrong under it once `errors` has a message for it; nothing is sent from here.
 */
export function StaffForm({
  values,
  errors,
  onChange,
  onReveal,
  editing = false,
  teachingLocked = false,
  photo,
}: {
  values: StaffFormValues;
  errors: StaffProblems;
  onChange: <K extends StaffFormKey>(key: K, value: StaffFormValues[K]) => void;
  /** A box was left: its message may show. */
  onReveal: (key: StaffFormKey) => void;
  editing?: boolean;
  teachingLocked?: boolean;
  /** The person's photo, at the top of the first card. */
  photo?: React.ReactNode;
}) {
  // The roles the school named (made on Permissions > New role, or typed under Other before), offered before Other (2026-11-26). Chosen, it is sent
  // as Other with its name. Choosing Other itself opens the Role name box to write a new one (and keeps it open while a name is typed).
  const named = useGetRoleChoicesQuery().data?.data.items ?? [];
  const [writing, setWriting] = useState(false);
  const pickedNamed = values.role === "other" && !writing ? named.find((r) => r.key === namedRoleKey(values.roleOther)) : undefined;
  const role = pickedNamed ? undefined : STAFF_ROLES.find((r) => r.key === values.role);
  const usual = STAFF_ROLES.filter((r) => r.key !== "other").map((r) => ({ value: r.key, label: r.label }));
  const otherRole = STAFF_ROLES.find((r) => r.key === "other")!;
  const roleOptions = [...usual, ...named.map((r) => ({ value: r.key, label: r.label })), { value: otherRole.key, label: otherRole.label }];
  const chooseRole = (next: string) => {
    const choice = named.find((r) => r.key === next);
    if (choice) {
      setWriting(false);
      onChange("role", "other");
      onChange("roleOther", choice.label);
      return;
    }
    // Other: a new name is written (one of the school's own roles is in the list).
    if (next === "other") {
      setWriting(true);
      if (pickedNamed) onChange("roleOther", "");
    }
    onChange("role", next);
  };
  const born = birthDateRange(todayInIndia());
  const age = /^\d{4}-\d{2}-\d{2}$/.test(values.dateOfBirth) ? ageOn(values.dateOfBirth, todayInIndia()) : null;
  const text = (key: TextKey, keep?: (typed: string) => string) => ({
    id: staffFieldId(key),
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(key, (keep ? keep(e.target.value) : e.target.value) as never),
    onBlur: () => onReveal(key),
    "aria-invalid": errors[key] !== undefined ? true : undefined,
    "aria-describedby": errors[key] !== undefined ? `${staffFieldId(key)}-error` : undefined,
  });

  return (
    <>
      <FormCard index={0} icon={UserRound} tone="primary" title="Staff member">
        {photo && <div className="mb-5">{photo}</div>}
        <div className={GRID}>
          <Field id={staffFieldId("name")} label="Name" error={errors.name}>
            <Input {...text("name")} maxLength={TEACHER_LIMITS.name} autoComplete="off" placeholder="For example Asha Rao" />
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
            {age !== null && age >= 0 && <p className="mt-1.5 text-xs font-medium text-foreground-muted">{ageText(values.dateOfBirth)}</p>}
          </Field>
          <Field id={staffFieldId("gender")} label="Gender" optional error={errors.gender}>
            <ChipPicker label="Gender" value={values.gender} options={GENDERS.map((g) => ({ value: g, label: g }))} onChange={(g) => onChange("gender", g as StaffFormValues["gender"])} />
          </Field>
          <Field id={staffFieldId("mobile")} label="Mobile number" optional error={errors.mobile}>
            <Input {...text("mobile", mobileDigits)} icon={Phone} prefix="+91" type="tel" inputMode="numeric" autoComplete="off" placeholder="98765 43210" />
          </Field>
          <Field id={staffFieldId("email")} label="Email" optional={editing || !values.giveLogin} error={errors.email}>
            <Input {...text("email")} icon={Mail} type="email" autoComplete="off" placeholder="asha@school.example" />
          </Field>
        </div>
        {!editing && <LoginAccessBox id={staffFieldId("giveLogin")} className="mt-5 w-fit" checked={values.giveLogin} onChange={(on) => onChange("giveLogin", on)} />}
      </FormCard>

      <FormCard index={1} icon={Home} tone="success" title="Address">
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

      <FormCard index={2} icon={Briefcase} tone="navy" title="Role">
        <div className={GRID}>
          <Field id={staffFieldId("role")} label="Role" error={errors.role}>
            <Select
              id={staffFieldId("role")}
              value={pickedNamed ? pickedNamed.key : values.role}
              placeholder="Choose the role"
              invalid={errors.role !== undefined}
              options={roleOptions}
              onChange={chooseRole}
            />
          </Field>
          {values.role === "other" && !pickedNamed && (
            <Field id={staffFieldId("roleOther")} label="Role name" error={errors.roleOther}>
              <Input {...text("roleOther")} maxLength={MAX_ROLE_OTHER + 10} autoComplete="off" placeholder="For example Lab technician" />
            </Field>
          )}
        </div>
        {role && <p className="mt-3 text-sm text-foreground-muted">{role.description}</p>}

        <div className="mt-5 space-y-3">
          <Switch checked={values.alsoTeacher} disabled={teachingLocked} onChange={(on) => onChange("alsoTeacher", on)}>
            Also a teacher
          </Switch>
          {values.alsoTeacher && (
            <div>
              <p className="mb-2 text-sm font-semibold text-foreground">
                Subjects they teach <span className="font-normal text-foreground-muted">(optional)</span>
              </p>
              <SubjectChips value={values.subjectIds} onChange={(ids) => onChange("subjectIds", ids)} />
              {errors.subjectIds && (
                <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
                  {errors.subjectIds}
                </p>
              )}
              {role && ROLES_KEEPING_THEIR_LOGIN.includes(role.key) && (
                <p className="mt-2 text-sm text-foreground-muted">
                  A {role.label} keeps the {role.label} login. They are added to Teachers, so classes and periods can be given to them.
                </p>
              )}
            </div>
          )}
        </div>

        <div className={`${GRID} mt-5`}>
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
      </FormCard>
    </>
  );
}
