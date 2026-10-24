import { Circle, CircleCheck, Hash, Lightbulb, Phone, ShieldCheck, UserRound, UsersRound } from "lucide-react";
import { STUDENT_FORM_FIELDS, type CustomFieldDef, type FieldRules, type FormFieldKey } from "../../../constants/studentFields";
import { TONES } from "../../../constants/tones";
import { cn } from "../../../utils/helpers";
import { ageOn, formatMobile, placeLabel, todayInIndia, type FormErrors, type StudentFormValues } from "../../../utils/students";
import type { AcademicStructure } from "../../../types";
import { Card } from "../../ui/Card";
import { StickyAside } from "../../ui/StickyAside";
import { StudentAvatar } from "../StudentAvatar";

const tidy = (text: string) => text.trim().replace(/\s+/g, " ");

/**
 * "This is how the student will look": the name, the class and section, gender and age, and the primary parent, drawn from what has been
 * typed so far (nothing is sent). The admission number is not known until the server makes it, and the card says so.
 */
function LivePreview({ values, structure }: { values: StudentFormValues; structure: AcademicStructure }) {
  const name = `${tidy(values.firstName)} ${tidy(values.lastName)}`.trim();
  const klass = structure.classes.find((c) => c.id === values.classId);
  const section = klass?.sections.find((s) => s.id === values.sectionId);
  const place = klass ? placeLabel({ className: klass.name, sectionName: section?.name ?? null }) : null;
  const dob = /^\d{4}-\d{2}-\d{2}$/.test(values.dateOfBirth) ? ageOn(values.dateOfBirth, values.admissionDate || todayInIndia()) : null;
  const parent = values.guardians.find((g) => g.isPrimary);
  const parentName = parent ? (parent.match?.name ?? tidy(parent.name)) : "";
  const started = !!(name || place || parentName || parent?.mobile);

  return (
    <Card className="p-4 text-center" aria-label="Preview of the student">
      {name ? (
        <StudentAvatar name={name} seed={name} size="lg" className="mx-auto" />
      ) : (
        <span aria-hidden className={cn("mx-auto flex size-16 items-center justify-center rounded-full", TONES.primary.tile)}>
          <UserRound className="size-8" />
        </span>
      )}
      <p className="mt-3 text-base font-bold text-foreground">{name || "New student"}</p>

      {started ? (
        <div className="fade-in mt-3 space-y-2.5 text-sm">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {place && <span className={cn("rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ring-inset", TONES.success.chip)}>{place}</span>}
            {values.gender && <span className="rounded-lg bg-surface-muted px-2.5 py-1 text-xs font-semibold text-foreground-muted ring-1 ring-inset ring-border">{values.gender}</span>}
            {dob !== null && dob >= 0 && (
              <span className="rounded-lg bg-surface-muted px-2.5 py-1 text-xs font-semibold text-foreground-muted ring-1 ring-inset ring-border">
                {dob} year{dob === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {(parentName || parent?.mobile) && (
            <p className="flex items-center justify-center gap-1.5 text-xs text-foreground-muted">
              <Phone className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {parentName && <span className="font-semibold text-foreground">{parentName}</span>}
                {parent?.mobile && <> {formatMobile(parent.mobile)}</>}
              </span>
            </p>
          )}
          <p className="flex items-center justify-center gap-1.5 border-t border-border pt-2.5 text-xs text-foreground-muted">
            <Hash className="size-3.5 shrink-0" aria-hidden />
            Admission number is given when you press Admit
          </p>
        </div>
      ) : (
        <p className="mt-3 border-t border-border pt-3 text-sm italic text-foreground-muted">Fill the form to see a live preview here</p>
      )}
    </Card>
  );
}

/**
 * The details counted under Parent (both parents, the occupation) or Address; any other one the school needs (and its own fields) is
 * "Other details".
 */
const PARENT_OR_ADDRESS: FormFieldKey[] = ["secondParent", "guardianOccupation", "addressLine1", "addressArea", "addressCity", "addressState", "addressPincode"];
const ADDRESS_RULES: FormFieldKey[] = ["addressLine1", "addressArea", "addressCity", "addressState", "addressPincode"];

/** One thing the admission needs, and whether the boxes for it are right (none of its boxes has a message). */
function completionItems(problems: FormErrors, rules: FieldRules, custom: CustomFieldDef[]): { label: string; done: boolean }[] {
  const under = (key: string, paths: string[]) => paths.some((p) => key === p || key.startsWith(`${p}.`));
  const none = (...paths: string[]) => !Object.keys(problems).some((key) => under(key, paths));
  const listed = ["firstName", "lastName", "gender", "dateOfBirth", "classId", "sectionId", "guardians", "address"];
  const needs = (keys: FormFieldKey[]) => keys.some((k) => rules[k] === "required");
  const others = STUDENT_FORM_FIELDS.map((f) => f.key).filter((k) => !PARENT_OR_ADDRESS.includes(k));
  return [
    { label: "Name", done: none("firstName", "lastName") },
    { label: "Gender", done: none("gender") },
    { label: "Date of birth", done: none("dateOfBirth") },
    { label: "Class and section", done: none("classId", "sectionId") },
    { label: "Parent and mobile number", done: none("guardians") },
    // Counted only when the school needs it (its fields, on Students > Export): a checklist item that is never asked is no step.
    ...(needs(ADDRESS_RULES) ? [{ label: "Address", done: none("address") }] : []),
    ...(needs(others) || custom.some((f) => f.mode === "required" && f.type !== "yesNo") ? [{ label: "Other details your school needs", done: !Object.keys(problems).some((key) => !under(key, listed)) }] : []),
  ];
}

/**
 * How much of what the admission needs is filled in, as a bar and a checklist. It follows the same rules as the boxes (the server's
 * words), so "done" means "nothing under these boxes is wrong". Only what is required is counted.
 */
function FormCompletion({ problems, rules, custom }: { problems: FormErrors; rules: FieldRules; custom: CustomFieldDef[] }) {
  const items = completionItems(problems, rules, custom);
  const done = items.filter((i) => i.done).length;
  const percent = Math.round((done / items.length) * 100);

  return (
    <Card className="p-4" aria-label="How much of the form is filled in">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground">Form completion</h2>
        <span className="text-sm font-bold text-foreground" aria-live="polite">
          {percent}%
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Form completion">
        <div className={cn("h-full rounded-full transition-all duration-500", percent === 100 ? "bg-success" : "bg-primary")} style={{ width: `${percent}%` }} />
      </div>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.label} className={cn("flex items-center gap-2.5 text-sm transition-colors", item.done ? "font-semibold text-foreground" : "text-foreground-muted")}>
            {item.done ? <CircleCheck className="size-4.5 shrink-0 text-success" aria-hidden /> : <Circle className="size-4.5 shrink-0 text-border" aria-hidden />}
            {item.label}
            <span className="sr-only">{item.done ? " is filled in" : " is not filled in yet"}</span>
          </li>
        ))}
      </ul>
      {percent === 100 && <p className="pop-in mt-4 rounded-lg bg-success-soft px-3 py-2 text-xs font-semibold text-success">Everything needed is filled in: press Admit.</p>}
    </Card>
  );
}

const TIPS: { icon: typeof Phone; tone: "success" | "info" | "warning" | "primary"; text: string }[] = [
  { icon: Phone, tone: "success", text: "Type the parent's mobile first: a parent already here is found and linked." },
  { icon: Hash, tone: "info", text: "The admission number (ADM-2026-0001) is given when you press Admit." },
  { icon: ShieldCheck, tone: "warning", text: "A full section asks before it takes one more student." },
  { icon: UsersRound, tone: "primary", text: "A brother or sister: Admit a sibling on the student's page fills the parents in." },
];

/** The column beside the admission form: the preview, how much is filled in, and the tips. It only reads what has been typed. */
export function AdmitSidebar({
  values,
  problems,
  rules,
  custom,
  structure,
}: {
  values: StudentFormValues;
  problems: FormErrors;
  rules: FieldRules;
  custom: CustomFieldDef[];
  structure: AcademicStructure;
}) {
  return (
    <StickyAside label="About this admission" className="space-y-4">
      <LivePreview values={values} structure={structure} />
      <FormCompletion problems={problems} rules={rules} custom={custom} />
      <QuickTips />
    </StickyAside>
  );
}

/** A few lines for someone admitting for the first time. */
function QuickTips() {
  return (
    <Card className="p-4" aria-label="Quick tips">
      <h2 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <span aria-hidden className={cn("flex size-7 items-center justify-center rounded-lg", TONES.warning.tile)}>
          <Lightbulb className="size-4" />
        </span>
        Quick tips
      </h2>
      <ul className="mt-3 space-y-2.5">
        {TIPS.map((tip) => (
          <li key={tip.text} className="flex gap-2.5 text-xs leading-relaxed text-foreground-muted">
            <tip.icon className={cn("mt-0.5 size-4 shrink-0", TONES[tip.tone].text)} aria-hidden />
            {tip.text}
          </li>
        ))}
      </ul>
    </Card>
  );
}
