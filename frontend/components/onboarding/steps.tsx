"use client";

import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building,
  CalendarDays,
  CalendarRange,
  Globe,
  GraduationCap,
  Hash,
  Landmark,
  Mail,
  Map,
  MapPin,
  MapPinned,
  Pencil,
  Phone,
  School,
  Smartphone,
  UserRound,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CLASS_LEVELS, DESIGNATIONS, MONTHS, OTHER_CHOICE, SCHOOL_TYPES, STATES, STATE_BOARD_CHOICE } from "@/lib/schoolOptions";
import { isIndianMobile, isPhone, isPinCode, isEmail, isUdise } from "@/lib/validators";
import type { SchoolSteps } from "@/types";
import { BoardsField, emptyBoard } from "./BoardsField";
import { useFormValues, str, type FieldErrors, type FormDraft } from "./useFormValues";

/** A step saves its values and says what went wrong, field by field. null means it worked. */
export type SubmitStep = (values: Record<string, unknown>) => Promise<FieldErrors | null>;

interface StepProps<K extends 1 | 2 | 3> {
  initial: SchoolSteps[K];
  /** Typed but not saved yet: kept by the wizard so Back and forth does not lose it. */
  draft?: FormDraft;
  onSubmit: SubmitStep;
  onBack?: () => void;
  saving: boolean;
}

function Footer({ onBack, saving, label = "Save & Continue" }: { onBack?: () => void; saving: boolean; label?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-6">
      {onBack ? (
        <Button type="button" variant="outline" onClick={onBack} disabled={saving}>
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Button>
      ) : (
        <span />
      )}
      <Button type="submit" loading={saving}>
        {label}
        <ArrowRight className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

const MONTH_OPTIONS = MONTHS.map((label, i) => ({ value: String(i + 1), label }));

/** A small blue caption that groups related fields, like LOCATION on the address step. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <legend className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-primary">{children}</legend>;
}

function ErrorSummary({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}

export function StepSchool({ initial, draft, onSubmit, saving }: StepProps<1>) {
  const f = useFormValues(
    {
      schoolName: initial.schoolName,
      schoolType: str(initial.schoolType),
      establishedYear: str(initial.establishedYear),
      boards: initial.boards.length > 0 ? initial.boards : [emptyBoard()],
      lowestClass: str(initial.lowestClass),
      highestClass: str(initial.highestClass),
      approxStudents: str(initial.approxStudents),
      sessionStartMonth: str(initial.sessionStartMonth),
      udiseCode: initial.udiseCode,
    },
    draft
  );
  const { values: v, errors, set } = f;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: FieldErrors = {};
    if (v.schoolName.trim().length < 2) next.schoolName = "Enter the school name.";
    if (!v.schoolType) next.schoolType = "Choose the type of school.";
    v.boards.forEach((entry, i) => {
      if (!entry.board) next[`boards.${i}.board`] = "Choose the board.";
      if (entry.board === STATE_BOARD_CHOICE && !entry.stateBoard) next[`boards.${i}.stateBoard`] = "Choose the state board.";
      if (entry.board === OTHER_CHOICE && entry.otherBoard.trim().length < 2) next[`boards.${i}.otherBoard`] = "Enter the name of the board.";
      if (entry.mediums.length === 0) next[`boards.${i}.mediums`] = "Choose at least one medium.";
    });
    if (!v.lowestClass) next.lowestClass = "Choose the first class.";
    if (!v.highestClass) next.highestClass = "Choose the last class.";
    if (v.lowestClass && v.highestClass && CLASS_LEVELS.indexOf(v.lowestClass as never) > CLASS_LEVELS.indexOf(v.highestClass as never)) {
      next.highestClass = "The last class cannot be lower than the first class.";
    }
    const students = Number(v.approxStudents);
    if (!Number.isInteger(students) || students < 1) next.approxStudents = "Enter the number of students.";
    if (v.udiseCode && !isUdise(v.udiseCode)) next.udiseCode = "UDISE+ code is 11 digits.";
    if (v.establishedYear && !/^\d{4}$/.test(v.establishedYear.trim())) next.establishedYear = "Enter a 4-digit year.";
    f.setErrors(next);
    if (Object.keys(next).length > 0) return;
    const serverErrors = await onSubmit({ ...v, sessionStartMonth: Number(v.sessionStartMonth) });
    if (serverErrors) f.setErrors(serverErrors);
  }

  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      <fieldset>
        <SectionLabel>Basics</SectionLabel>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="schoolName" label="School name" error={errors.schoolName}>
            <Input id="schoolName" icon={School} value={v.schoolName} onChange={(e) => set("schoolName", e.target.value)} required autoComplete="organization" aria-invalid={!!errors.schoolName} />
          </Field>
          <Field id="schoolType" label="Type of school" error={errors.schoolType}>
            <Select id="schoolType" icon={Landmark} value={v.schoolType} onChange={(value) => set("schoolType", value)} options={SCHOOL_TYPES} placeholder="Choose type" invalid={!!errors.schoolType} />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <SectionLabel>Board and medium</SectionLabel>
        <p className="-mt-2 mb-4 text-sm text-foreground-muted">
          Add every board your school follows, with the medium it is taught in and that board&apos;s own affiliation number. If a board is taught
          in English and Hindi, choose both. Following another board too? Use &ldquo;Add another board&rdquo;.
        </p>
        <BoardsField value={v.boards} onChange={(boards) => set("boards", boards)} errors={errors} />
      </fieldset>

      <fieldset>
        <SectionLabel>Classes and size</SectionLabel>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="lowestClass" label="Classes from" error={errors.lowestClass}>
            <Select id="lowestClass" icon={GraduationCap} value={v.lowestClass} onChange={(value) => set("lowestClass", value)} options={CLASS_LEVELS} placeholder="First class" invalid={!!errors.lowestClass} />
          </Field>
          <Field id="highestClass" label="Classes up to" error={errors.highestClass}>
            <Select id="highestClass" icon={GraduationCap} value={v.highestClass} onChange={(value) => set("highestClass", value)} options={CLASS_LEVELS} placeholder="Last class" invalid={!!errors.highestClass} />
          </Field>
          <Field id="approxStudents" label="Students (approximately)" error={errors.approxStudents}>
            <Input id="approxStudents" icon={Users} value={v.approxStudents} onChange={(e) => set("approxStudents", e.target.value)} inputMode="numeric" aria-invalid={!!errors.approxStudents} />
          </Field>
          <Field id="sessionStartMonth" label="Academic session starts in" error={errors.sessionStartMonth}>
            <Select id="sessionStartMonth" icon={CalendarRange} value={v.sessionStartMonth} onChange={(value) => set("sessionStartMonth", value)} options={MONTH_OPTIONS} />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <SectionLabel>Registration</SectionLabel>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="udiseCode" label="UDISE+ code" optional error={errors.udiseCode} hint="11 digits, printed on your UDISE+ certificate.">
            <Input id="udiseCode" icon={Hash} value={v.udiseCode} onChange={(e) => set("udiseCode", e.target.value)} inputMode="numeric" maxLength={11} aria-invalid={!!errors.udiseCode} />
          </Field>
          <Field id="establishedYear" label="Year established" optional error={errors.establishedYear}>
            <Input id="establishedYear" icon={CalendarDays} value={v.establishedYear} onChange={(e) => set("establishedYear", e.target.value)} inputMode="numeric" maxLength={4} placeholder="For example 1998" aria-invalid={!!errors.establishedYear} />
          </Field>
        </div>
      </fieldset>
      <ErrorSummary message={errors._form} />
      <Footer saving={saving} />
    </form>
  );
}

export function StepAddress({ initial, draft, onSubmit, onBack, saving }: StepProps<2>) {
  // The defaults cover answers saved before district and division existed (an input that starts as undefined makes React warn).
  const f = useFormValues({ ...initial, division: initial.division ?? "", district: initial.district ?? "" }, draft);
  const { values: v, errors, set } = f;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: FieldErrors = {};
    if (v.addressLine1.trim().length < 3) next.addressLine1 = "Enter the street address.";
    if (!STATES.includes(v.state as never)) next.state = "Choose the state.";
    if (v.district.trim().length < 2) next.district = "Enter the district.";
    if (v.city.trim().length < 2) next.city = "Enter the city.";
    if (!isPinCode(v.pincode)) next.pincode = "PIN code is 6 digits.";
    if (!isPhone(v.schoolPhone)) next.schoolPhone = "Enter a 10-digit phone number (for a landline, the STD code and the number).";
    if (!isEmail(v.schoolEmail)) next.schoolEmail = "Enter a valid email address.";
    if (v.website && !/^https?:\/\/\S+\.\S+/.test(v.website.trim())) next.website = "Enter a full web address, like https://school.in";
    f.setErrors(next);
    if (Object.keys(next).length > 0) return;
    const serverErrors = await onSubmit(v);
    if (serverErrors) f.setErrors(serverErrors);
  }

  return (
    <form onSubmit={submit} className="space-y-7" noValidate>
      <fieldset>
        <SectionLabel>Location</SectionLabel>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="addressLine1" label="Street address" error={errors.addressLine1} className="sm:col-span-2">
            <Input id="addressLine1" icon={MapPin} value={v.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} autoComplete="address-line1" aria-invalid={!!errors.addressLine1} />
          </Field>
          <Field id="addressLine2" label="Area, landmark" optional error={errors.addressLine2}>
            <Input id="addressLine2" icon={MapPinned} value={v.addressLine2} onChange={(e) => set("addressLine2", e.target.value)} autoComplete="address-line2" />
          </Field>
          <Field id="pincode" label="PIN code" error={errors.pincode}>
            <Input id="pincode" icon={Hash} value={v.pincode} onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={6} autoComplete="postal-code" aria-invalid={!!errors.pincode} />
          </Field>
          <Field id="state" label="State" error={errors.state}>
            <Select id="state" icon={Map} value={v.state} onChange={(value) => set("state", value)} options={STATES} placeholder="Choose state" invalid={!!errors.state} />
          </Field>
          <Field id="division" label="Division" optional error={errors.division} hint="Leave empty if your state has no divisions.">
            <Input id="division" icon={Landmark} value={v.division} onChange={(e) => set("division", e.target.value)} maxLength={80} placeholder="For example Bhopal" />
          </Field>
          <Field id="district" label="District" error={errors.district}>
            <Input id="district" icon={MapPinned} value={v.district} onChange={(e) => set("district", e.target.value)} maxLength={80} aria-invalid={!!errors.district} />
          </Field>
          <Field id="city" label="City / town" error={errors.city}>
            <Input id="city" icon={Building} value={v.city} onChange={(e) => set("city", e.target.value)} autoComplete="address-level2" aria-invalid={!!errors.city} />
          </Field>
        </div>
      </fieldset>

      <fieldset>
        <SectionLabel>Contact</SectionLabel>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="schoolPhone" label="School phone" error={errors.schoolPhone}>
            <Input id="schoolPhone" icon={Phone} prefix="+91" type="tel" value={v.schoolPhone} onChange={(e) => set("schoolPhone", e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={10} placeholder="10 digits" autoComplete="tel-national" aria-invalid={!!errors.schoolPhone} />
          </Field>
          <Field id="schoolEmail" label="School email" error={errors.schoolEmail} hint="The address parents and the office will see.">
            <Input id="schoolEmail" icon={Mail} type="email" value={v.schoolEmail} onChange={(e) => set("schoolEmail", e.target.value)} aria-invalid={!!errors.schoolEmail} />
          </Field>
          <Field id="website" label="Website" optional error={errors.website} className="sm:col-span-2">
            <Input id="website" icon={Globe} type="url" value={v.website} onChange={(e) => set("website", e.target.value)} placeholder="https://school.in" aria-invalid={!!errors.website} />
          </Field>
        </div>
      </fieldset>
      <ErrorSummary message={errors._form} />
      <Footer onBack={onBack} saving={saving} />
    </form>
  );
}

export function StepProfile({ initial, draft, onSubmit, onBack, saving }: StepProps<3>) {
  const f = useFormValues(
    {
      adminName: initial.adminName,
      designation: str(initial.designation),
      designationOther: initial.designationOther ?? "",
      mobile: initial.mobile,
      alternateMobile: initial.alternateMobile,
    },
    draft
  );
  const { values: v, errors, set } = f;
  const askRole = v.designation === OTHER_CHOICE;

  // What was written in only means something while "Other" is chosen.
  function chooseRole(designation: string) {
    set("designation", designation);
    if (designation !== OTHER_CHOICE && v.designationOther) set("designationOther", "");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: FieldErrors = {};
    if (v.adminName.trim().length < 2) next.adminName = "Enter your full name.";
    if (!v.designation) next.designation = "Choose your role in the school.";
    if (askRole && v.designationOther.trim().length < 2) next.designationOther = "Tell us your role.";
    if (!isIndianMobile(v.mobile)) next.mobile = "Enter a 10-digit mobile number.";
    if (v.alternateMobile && !isIndianMobile(v.alternateMobile)) next.alternateMobile = "Enter a 10-digit mobile number.";
    f.setErrors(next);
    if (Object.keys(next).length > 0) return;
    const serverErrors = await onSubmit(v);
    if (serverErrors) f.setErrors(serverErrors);
  }

  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      <fieldset>
        <SectionLabel>About you</SectionLabel>
        <p className="-mt-2 mb-4 text-sm text-foreground-muted">
          You are creating the school&apos;s administrator account. Teachers and other staff are added after the school is approved.
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="adminName" label="Your full name" error={errors.adminName}>
            <Input id="adminName" icon={UserRound} value={v.adminName} onChange={(e) => set("adminName", e.target.value)} autoComplete="name" aria-invalid={!!errors.adminName} />
          </Field>
          <div className="space-y-5">
            <Field id="designation" label="Your role in the school" error={errors.designation}>
              <Select id="designation" icon={BadgeCheck} value={v.designation} onChange={chooseRole} options={DESIGNATIONS} placeholder="Choose role" invalid={!!errors.designation} />
            </Field>
            {askRole && (
              <Field id="designationOther" label="What is your role?" error={errors.designationOther}>
                <Input id="designationOther" icon={Pencil} value={v.designationOther} onChange={(e) => set("designationOther", e.target.value)} maxLength={50} placeholder="For example Vice Chairman" aria-invalid={!!errors.designationOther} />
              </Field>
            )}
          </div>
          <Field id="mobile" label="Mobile number" error={errors.mobile} hint="10 digits. We may call to verify your school.">
            <Input id="mobile" icon={Smartphone} prefix="+91" type="tel" value={v.mobile} onChange={(e) => set("mobile", e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={10} placeholder="10 digits" autoComplete="tel-national" aria-invalid={!!errors.mobile} />
          </Field>
          <Field id="alternateMobile" label="Alternate mobile" optional error={errors.alternateMobile}>
            <Input id="alternateMobile" icon={Smartphone} prefix="+91" type="tel" value={v.alternateMobile} onChange={(e) => set("alternateMobile", e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={10} placeholder="10 digits" aria-invalid={!!errors.alternateMobile} />
          </Field>
        </div>
      </fieldset>
      <ErrorSummary message={errors._form} />
      <Footer onBack={onBack} saving={saving} />
    </form>
  );
}
