import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Building,
  CalendarDays,
  Globe,
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
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { DESIGNATIONS, OTHER_CHOICE, SCHOOL_TYPES, STATES, STATE_BOARD_CHOICE, boardLabel } from "../../constants/schoolOptions";
import { checkAcademicYear } from "../../utils/academicYear";
import { boardFromApi, boardToApi, planErrors } from "../../utils/mediumPlans";
import { isIndianMobile, isPhone, isPinCode, isEmail, isUdise } from "../../utils/validators";
import type { BoardDraft, MediumPlanDraft, SchoolSteps } from "../../types";
import { PAGE_GRID } from "../students/form/formGrid";
import { AcademicYearFields } from "./AcademicYearFields";
import { BoardsField, emptyBoard } from "./BoardsField";
import { LogoField } from "./LogoField";
import { OnboardSection } from "./OnboardSection";
import { PlanSections } from "./PlanSections";
import { useHeaderSlots } from "./stage";
import { useFormValues, str, type FieldErrors, type FormDraft } from "./useFormValues";

/** A step saves its values and says what went wrong, field by field. null means it worked. */
export type SubmitStep = (values: Record<string, unknown>) => Promise<FieldErrors | null>;

interface StepProps<I> {
  initial: I;
  /** Typed but not saved yet: kept by the wizard so Back and forth does not lose it. */
  draft?: FormDraft;
  onSubmit: SubmitStep;
  onBack?: () => void;
  saving: boolean;
}

/**
 * The buttons at the end of every screen: Previous on the left, Save & Continue on the right. Only the buttons: no bar, no background, and
 * nothing fixed to the window: they are at the bottom of the form, and are found by scrolling down to it.
 */
function Footer({ onBack, saving, label = "Save & Continue" }: { onBack?: () => void; saving: boolean; label?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      {onBack ? (
        <Button type="button" variant="outline" onClick={onBack} disabled={saving} className="rounded-xl border-primary! px-5 text-primary hover:bg-primary-soft">
          <ArrowLeft className="size-4" aria-hidden />
          Previous
        </Button>
      ) : (
        <span />
      )}
      <Button type="submit" loading={saving} className="rounded-xl px-6">
        {label}
        <ArrowRight className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

function ErrorSummary({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}

/** The form is long: a problem far up the page is brought into view, or the school would only see that nothing happened. */
function showFirstProblem() {
  requestAnimationFrame(() => document.querySelector('[aria-invalid="true"], [data-invalid="true"], form [role="alert"]')?.scrollIntoView?.({ block: "center", behavior: "smooth" }));
}

/** The school and where it is: its name, type and logo, its address and contact, its size and numbers. */
export function StepSchool({ initial, draft, onSubmit, saving }: StepProps<SchoolSteps[1] & SchoolSteps[2]>) {
  // The defaults cover answers saved before district and division existed (an input that starts as undefined makes React warn).
  const f = useFormValues(
    {
      schoolName: initial.schoolName,
      schoolType: str(initial.schoolType),
      addressLine1: initial.addressLine1 ?? "",
      addressLine2: initial.addressLine2 ?? "",
      pincode: initial.pincode ?? "",
      state: initial.state ?? "",
      division: initial.division ?? "",
      district: initial.district ?? "",
      city: initial.city ?? "",
      schoolPhone: initial.schoolPhone ?? "",
      schoolEmail: initial.schoolEmail ?? "",
      website: initial.website ?? "",
      approxStudents: str(initial.approxStudents),
      udiseCode: initial.udiseCode ?? "",
      establishedYear: str(initial.establishedYear),
    },
    draft
  );
  const { values: v, errors, set } = f;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: FieldErrors = {};
    if (v.schoolName.trim().length < 2) next.schoolName = "Enter the school name.";
    if (!v.schoolType) next.schoolType = "Choose the type of school.";
    if (v.addressLine1.trim().length < 3) next.addressLine1 = "Enter the street address.";
    if (!STATES.includes(v.state as never)) next.state = "Choose the state.";
    if (v.district.trim().length < 2) next.district = "Enter the district.";
    if (v.city.trim().length < 2) next.city = "Enter the city.";
    if (!isPinCode(v.pincode)) next.pincode = "PIN code is 6 digits.";
    if (!isPhone(v.schoolPhone)) next.schoolPhone = "Enter a 10-digit phone number (for a landline, the STD code and the number).";
    if (!isEmail(v.schoolEmail)) next.schoolEmail = "Enter a valid email address.";
    if (v.website && !/^https?:\/\/\S+\.\S+/.test(v.website.trim())) next.website = "Enter a full web address, like https://school.in";
    const students = Number(v.approxStudents);
    if (!Number.isInteger(students) || students < 1) next.approxStudents = "Enter the number of students.";
    if (v.udiseCode && !isUdise(v.udiseCode)) next.udiseCode = "UDISE+ code is 11 digits.";
    if (v.establishedYear && !/^\d{4}$/.test(v.establishedYear.trim())) next.establishedYear = "Enter a 4-digit year.";
    f.setErrors(next);
    if (Object.keys(next).length > 0) {
      showFirstProblem();
      return;
    }
    const serverErrors = await onSubmit(v);
    if (serverErrors) {
      f.setErrors(serverErrors);
      showFirstProblem();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <OnboardSection icon={School} title="Basics">
        <div className={PAGE_GRID}>
          <Field id="schoolName" label="School name" error={errors.schoolName}>
            <Input id="schoolName" icon={School} value={v.schoolName} onChange={(e) => set("schoolName", e.target.value)} required autoComplete="organization" aria-invalid={!!errors.schoolName} />
          </Field>
          <Field id="schoolType" label="Type of school" error={errors.schoolType}>
            <Select id="schoolType" icon={Landmark} value={v.schoolType} onChange={(value) => set("schoolType", value)} options={SCHOOL_TYPES} placeholder="Choose type" invalid={!!errors.schoolType} />
          </Field>
          <LogoField logoUrl={initial.logoUrl ?? ""} />
        </div>
      </OnboardSection>

      <OnboardSection icon={MapPin} title="Location">
        <div className={PAGE_GRID}>
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
      </OnboardSection>

      <OnboardSection icon={Phone} title="Contact">
        <div className={PAGE_GRID}>
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
      </OnboardSection>

      <OnboardSection icon={Hash} title="Registration">
        <div className={PAGE_GRID}>
          <Field id="approxStudents" label="Students (approximately)" error={errors.approxStudents}>
            <Input id="approxStudents" icon={Users} value={v.approxStudents} onChange={(e) => set("approxStudents", e.target.value)} inputMode="numeric" aria-invalid={!!errors.approxStudents} />
          </Field>
          <Field id="udiseCode" label="UDISE+ code" optional error={errors.udiseCode} hint="11 digits, printed on your UDISE+ certificate.">
            <Input id="udiseCode" icon={Hash} value={v.udiseCode} onChange={(e) => set("udiseCode", e.target.value)} inputMode="numeric" maxLength={11} aria-invalid={!!errors.udiseCode} />
          </Field>
          <Field id="establishedYear" label="Year established" optional error={errors.establishedYear}>
            <Input id="establishedYear" icon={CalendarDays} value={v.establishedYear} onChange={(e) => set("establishedYear", e.target.value)} inputMode="numeric" maxLength={4} placeholder="For example 1998" aria-invalid={!!errors.establishedYear} />
          </Field>
        </div>
      </OnboardSection>
      <ErrorSummary message={errors._form} />
      <Footer saving={saving} />
    </form>
  );
}

/** What the Academic Year and Class Sections screens start from: the saved year and boards (each medium with its plan), with any unsaved draft laid over. */
function academicInitial(initial: SchoolSteps[1]) {
  return {
    boards: initial.boards.length > 0 ? initial.boards.map(boardFromApi) : [emptyBoard()],
    // Named like the server's error paths ("academicYear.endDate"), so its messages land under the right box.
    "academicYear.name": initial.academicYear?.name ?? "",
    "academicYear.startDate": initial.academicYear?.startDate ?? "",
    "academicYear.endDate": initial.academicYear?.endDate ?? "",
  };
}
type AcademicValues = ReturnType<typeof academicInitial>;

/** What is wrong with the year and with each board's board and medium (the Academic Year screen's boxes), by the name of the box. */
function yearAndBoardErrors(v: AcademicValues): FieldErrors {
  const next: FieldErrors = {};
  v.boards.forEach((entry, i) => {
    if (!entry.board) next[`boards.${i}.board`] = "Choose the board.";
    if (entry.board === STATE_BOARD_CHOICE && !entry.stateBoard) next[`boards.${i}.stateBoard`] = "Choose the state board.";
    if (entry.board === OTHER_CHOICE && entry.otherBoard.trim().length < 2) next[`boards.${i}.otherBoard`] = "Enter the name of the board.";
    if (entry.mediums.length === 0) next[`boards.${i}.mediums`] = "Choose at least one medium.";
  });
  const year = checkAcademicYear(v["academicYear.name"], v["academicYear.startDate"], v["academicYear.endDate"]);
  for (const [field, message] of Object.entries(year)) if (message) next[`academicYear.${field}`] = message;
  return next;
}

/** What is wrong with each medium's classes and timing (the Class Sections screen's boxes), by the name of the box. */
function planProblems(v: AcademicValues): FieldErrors {
  const next: FieldErrors = {};
  v.boards.forEach((entry, i) => entry.plans.forEach((plan, p) => Object.assign(next, planErrors(plan, `boards.${i}.plans.${p}`))));
  return next;
}

/** Whether a message from the server is about a box of the Academic Year screen (the year, or a board's board or medium). */
const isAcademicBox = (path: string) => path === "boards" || path.startsWith("academicYear") || /^boards\.\d+\.(board|stateBoard|otherBoard|mediums|affiliationNumber)$/.test(path);

/**
 * The Academic Year screen: the session, and the boards the school follows with the medium(s) of each. It saves nothing by itself: the
 * year, the boards and each medium's classes are one step on the server, saved when the next screen, Class Sections, is. Continue checks
 * these boxes and opens it; what was typed stays (the wizard keeps it) when the person goes back and forth.
 */
export function StepAcademic({ initial, draft, onContinue, onBack, errorsFromNext }: Omit<StepProps<SchoolSteps[1]>, "onSubmit" | "saving"> & { onContinue: () => void; errorsFromNext?: FieldErrors }) {
  const f = useFormValues(academicInitial(initial), draft, errorsFromNext);
  const { values: v, errors, set } = f;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = yearAndBoardErrors(v);
    f.setErrors(next);
    if (Object.keys(next).length > 0) {
      showFirstProblem();
      return;
    }
    onContinue();
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <OnboardSection icon={CalendarDays} title="Academic year">
        <AcademicYearFields
          idPrefix="academicYear"
          values={{ name: v["academicYear.name"], startDate: v["academicYear.startDate"], endDate: v["academicYear.endDate"] }}
          errors={{ name: errors["academicYear.name"] ?? errors.academicYear, startDate: errors["academicYear.startDate"], endDate: errors["academicYear.endDate"] }}
          onChange={(field, value) => set(`academicYear.${field}`, value)}
        />
      </OnboardSection>

      <OnboardSection icon={BookOpen} title="Board and medium">
        <BoardsField value={v.boards} onChange={(boards) => set("boards", boards)} errors={errors} />
      </OnboardSection>
      <ErrorSummary message={errors._form} />
      <Footer onBack={onBack} saving={false} />
    </form>
  );
}

/**
 * The Class Sections screen: for each medium of each board, the classes it runs with their sections, seats and room, its timing and (for
 * Class 11 and 12) its streams. Saving it saves the whole step 2: the year and the boards from the screen before, and these. A problem in
 * the year or a board is shown on the Academic Year screen (`onFixAcademic` opens it with the messages), a problem here under its box.
 */
export function StepClasses({
  initial,
  draft,
  onSubmit,
  onBack,
  onFixAcademic,
  onEditYear,
  saving,
}: StepProps<SchoolSteps[1]> & { onFixAcademic: (errors: FieldErrors) => void; onEditYear: () => void }) {
  const f = useFormValues(academicInitial(initial), draft);
  const { values: v, errors, set } = f;
  const rows = v.boards;
  // Where the frame lets this screen put its bar and Quick Fill (only used when there is one medium).
  const slots = useHeaderSlots();

  const updatePlan = (boardIndex: number, planIndex: number, next: MediumPlanDraft) =>
    set("boards", rows.map((entry, b) => (b === boardIndex ? { ...entry, plans: entry.plans.map((plan, p) => (p === planIndex ? next : plan)) } : entry)));
  // What a medium is called: its board too, once the school follows more than one.
  const titleOf = (entry: BoardDraft, plan: MediumPlanDraft) => `${rows.length > 1 && entry.board ? `${boardLabel(entry)} · ` : ""}${plan.medium} Medium`;
  // How many mediums the school has: one is its own page, several are told apart by their names.
  const count = rows.reduce((n, entry) => n + entry.plans.length, 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // The whole step is checked again, so a board changed after the screen before is not sent wrong.
    const academic = yearAndBoardErrors(v);
    if (Object.keys(academic).length > 0) {
      onFixAcademic(academic);
      return;
    }
    const next = planProblems(v);
    f.setErrors(next);
    if (Object.keys(next).length > 0) {
      showFirstProblem();
      return;
    }
    // The month the session starts in, and the first and last class of the school, are read by the server.
    const serverErrors = await onSubmit({
      boards: v.boards.map(boardToApi),
      academicYear: { name: v["academicYear.name"].trim(), startDate: v["academicYear.startDate"], endDate: v["academicYear.endDate"] },
    });
    if (!serverErrors) return;
    const fixHere = Object.fromEntries(Object.entries(serverErrors).filter(([path]) => !isAcademicBox(path)));
    const fixThere = Object.fromEntries(Object.entries(serverErrors).filter(([path]) => isAcademicBox(path)));
    if (Object.keys(fixThere).length > 0) {
      onFixAcademic(fixThere);
      return;
    }
    f.setErrors(fixHere);
    showFirstProblem();
  }

  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      {count === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-white/70 p-5 text-center text-sm text-foreground-muted">
          Choose a board and a medium on the Academic Year screen first: each medium gets its classes here.
        </p>
      )}
      {rows.flatMap((entry, b) =>
        entry.plans.map((plan, p) => (
          <PlanSections
            key={`${b}.${plan.medium}`}
            title={titleOf(entry, plan)}
            plan={plan}
            prefix={`boards.${b}.plans.${p}`}
            errors={errors}
            yearName={v["academicYear.name"]}
            showTitle={count > 1}
            onChange={(next) => updatePlan(b, p, next)}
            onEditYear={onEditYear}
            slots={count === 1 ? slots : undefined}
          />
        ))
      )}
      {rows.map((_, b) => errors[`boards.${b}.plans`] && (
        <p key={b} role="alert" className="text-xs font-medium text-danger">
          {errors[`boards.${b}.plans`]}
        </p>
      ))}
      <ErrorSummary message={errors._form} />
      <Footer onBack={onBack} saving={saving} />
    </form>
  );
}

export function StepProfile({ initial, draft, onSubmit, onBack, saving }: StepProps<SchoolSteps[3]>) {
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
    <form onSubmit={submit} className="space-y-6" noValidate>
      <OnboardSection icon={UserRound} title="About you">
        <div className={PAGE_GRID}>
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
      </OnboardSection>
      <ErrorSummary message={errors._form} />
      <Footer onBack={onBack} saving={saving} />
    </form>
  );
}
