import { CalendarDays, Hash, Phone } from "lucide-react";
import { BLOOD_GROUPS } from "../../../constants/students";
import { DISABILITIES, RELIGIONS, fieldOf, type CustomFieldDef, type MovableKey } from "../../../constants/studentFields";
import { fieldId, type StudentForm } from "../../../hooks/useStudentForm";
import { asks, mayLeave } from "../../../utils/fieldRules";
import { Field } from "../../ui/Field";
import { Input } from "../../ui/Input";
import { Switch } from "../../ui/Switch";
import { ChoiceSelect } from "./ChoiceSelect";

/** How each detail a school may place in any step is asked: the kind of box and its words. One place for every card that shows it. */
type Box =
  | { kind: "choice"; options: readonly string[]; placeholder: string }
  | { kind: "text"; maxLength: number; placeholder?: string }
  /** An ID made of digits only, no more than `digits` of them (what is pasted with spaces keeps its digits). */
  | { kind: "digits"; digits: number; placeholder: string }
  | { kind: "mobile" }
  | { kind: "tick"; hint: string };

const BOXES: Record<MovableKey, Box> = {
  bloodGroup: { kind: "choice", options: BLOOD_GROUPS, placeholder: "Select blood group" },
  religion: { kind: "choice", options: RELIGIONS, placeholder: "Select religion" },
  aadhaarNumber: { kind: "digits", digits: 12, placeholder: "12 digits" },
  samagraId: { kind: "digits", digits: 9, placeholder: "8 or 9 digits" },
  apaarId: { kind: "digits", digits: 12, placeholder: "12 digits" },
  pen: { kind: "digits", digits: 11, placeholder: "11 digits" },
  srNumber: { kind: "text", maxLength: 30, placeholder: "From the old register" },
  nationality: { kind: "text", maxLength: 40, placeholder: "Indian" },
  emergencyMobile: { kind: "mobile" },
  disability: { kind: "choice", options: DISABILITIES, placeholder: "Select" },
  medicalNotes: { kind: "text", maxLength: 300, placeholder: "Asthma, allergic to peanuts..." },
  feeConcession: { kind: "text", maxLength: 80, placeholder: "50% tuition, staff ward..." },
  transportRoute: { kind: "text", maxLength: 60, placeholder: "Route 3" },
  transportStop: { kind: "text", maxLength: 60, placeholder: "MP Nagar" },
  rteSeat: { kind: "tick", hint: "A free seat under the Right to Education Act" },
  bpl: { kind: "tick", hint: "Below the poverty line" },
};

/** One detail of the list as a labelled box, when the school asks it ("optional" in its label when it may be left empty). A tick is a TickBox. */
export function FieldBox({ form, rule }: { form: StudentForm; rule: MovableKey }) {
  const box = BOXES[rule];
  if (box.kind === "tick" || !asks(form.rules, rule)) return null;
  const label = fieldOf(rule).label;
  return (
    <Field id={fieldId(rule)} label={label} optional={mayLeave(form.rules, rule)} error={form.errorOf(rule)}>
      {box.kind === "choice" ? (
        <ChoiceSelect form={form} path={rule} options={box.options} placeholder={box.placeholder} />
      ) : box.kind === "mobile" ? (
        <Input {...form.bind(rule, "digits")} icon={Phone} prefix="+91" type="tel" inputMode="numeric" maxLength={10} />
      ) : box.kind === "digits" ? (
        <Input {...form.bind(rule, "digits", box.digits)} placeholder={box.placeholder} inputMode="numeric" autoComplete="off" />
      ) : (
        <Input {...form.bind(rule)} maxLength={box.maxLength} placeholder={box.placeholder} autoComplete="off" />
      )}
    </Field>
  );
}

/** A yes / no detail of the list (RTE seat, BPL family) as a switch, when the school asks it. */
export function TickBox({ form, rule }: { form: StudentForm; rule: MovableKey }) {
  const box = BOXES[rule];
  if (box.kind !== "tick" || !asks(form.rules, rule)) return null;
  return (
    <Switch checked={form.values[rule as "rteSeat" | "bpl"]} onChange={(on) => form.set(rule, on)} hint={box.hint}>
      {fieldOf(rule).label}
    </Switch>
  );
}

/** One of the school's own fields as a box of its kind: text, a number, a day, a list of choices (a tick is a CustomTick). */
export function CustomBox({ form, field }: { form: StudentForm; field: CustomFieldDef }) {
  const path = `custom.${field.key}`;
  if (field.type === "yesNo") return null;
  return (
    <Field id={fieldId(path)} label={field.label} optional={field.mode !== "required"} error={form.errorOf(path)}>
      {field.type === "choice" ? (
        <ChoiceSelect form={form} path={path} options={field.options} placeholder={`Choose the ${field.label}`} />
      ) : field.type === "date" ? (
        <Input {...form.bind(path)} type="date" icon={CalendarDays} />
      ) : field.type === "number" ? (
        <Input {...form.bind(path)} inputMode="decimal" icon={Hash} maxLength={16} />
      ) : (
        <Input {...form.bind(path)} maxLength={200} />
      )}
    </Field>
  );
}

/** One of the school's own yes / no fields as a switch. */
export function CustomTick({ form, field }: { form: StudentForm; field: CustomFieldDef }) {
  if (field.type !== "yesNo") return null;
  return (
    <Switch checked={form.values.custom[field.key] === true} onChange={(on) => form.set(`custom.${field.key}`, on)}>
      {field.label}
    </Switch>
  );
}
