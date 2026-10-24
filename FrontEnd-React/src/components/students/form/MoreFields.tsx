import { useState } from "react";
import { ChevronDown, ClipboardList, Phone } from "lucide-react";
import { DISABILITIES, STUDENT_FORM_FIELDS, type FormFieldKey } from "../../../constants/studentFields";
import { fieldId, type StudentForm } from "../../../hooks/useStudentForm";
import { asks, mayLeave } from "../../../utils/fieldRules";
import { cn } from "../../../utils/helpers";
import { Field } from "../../ui/Field";
import { Input } from "../../ui/Input";
import { Switch } from "../../ui/Switch";
import { ChoiceSelect } from "./ChoiceSelect";
import { FormCard } from "./FormCard";
import { FORM_GRID } from "./formGrid";

/** The details of this card: the personal ones, then fees and transport. */
const MORE_RULES = STUDENT_FORM_FIELDS.filter((f) => f.group === "More" && f.key !== "religion").map((f) => f.key as FormFieldKey);
const FEE_RULES = STUDENT_FORM_FIELDS.filter((f) => f.group === "Fees and transport").map((f) => f.key as FormFieldKey);
const ALL = [...MORE_RULES, ...FEE_RULES];

/**
 * The rest a school may keep: nationality, an emergency / WhatsApp number, a disability (CWSN), medical notes, an RTE seat, a BPL family,
 * a fee concession and the school bus. It starts folded on the admission form while none of it is needed, filled or wrong (open on a
 * student's page); the details the school does not ask for are not shown.
 */
export function MoreFields({ form, startOpen, index = 0 }: { form: StudentForm; startOpen: boolean; index?: number }) {
  const { values, rules } = form;
  const shown = ALL.filter((k) => asks(rules, k));
  const needed = shown.some((k) => !mayLeave(rules, k) && k !== "rteSeat" && k !== "bpl");
  const filled = !!(values.nationality || values.emergencyMobile || values.disability || values.medicalNotes || values.feeConcession || values.transportRoute || values.transportStop || values.rteSeat || values.bpl);
  const [opened, setOpened] = useState(startOpen);
  const open = opened || needed || filled || ALL.some((k) => form.errorOf(k));
  if (shown.length === 0) return null;

  const text = (rule: FormFieldKey, label: string, maxLength: number, placeholder?: string, icon?: typeof Phone) =>
    asks(rules, rule) && (
      <Field id={fieldId(rule)} label={label} optional={mayLeave(rules, rule)} error={form.errorOf(rule)}>
        <Input {...form.bind(rule)} maxLength={maxLength} placeholder={placeholder} icon={icon} />
      </Field>
    );

  return (
    <FormCard
      index={index}
      icon={ClipboardList}
      tone="navy"
      title="More details"
      description="Health, an emergency number, quota and fee concession, and the school bus."
      action={
        !needed && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpened(!open)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-primary-deep hover:bg-primary-soft"
          >
            {open ? "Hide" : "Show"}
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
        )
      }
    >
      {open ? (
        <div className="fade-in space-y-4">
          <div className={FORM_GRID}>
            {text("nationality", "Nationality", 40, "Indian")}
            {asks(rules, "emergencyMobile") && (
              <Field id={fieldId("emergencyMobile")} label="Emergency / WhatsApp number" optional={mayLeave(rules, "emergencyMobile")} error={form.errorOf("emergencyMobile")}>
                <Input {...form.bind("emergencyMobile", "digits")} icon={Phone} prefix="+91" type="tel" inputMode="numeric" maxLength={10} />
              </Field>
            )}
            {asks(rules, "disability") && (
              <Field id={fieldId("disability")} label="Disability (CWSN)" optional={mayLeave(rules, "disability")} error={form.errorOf("disability")}>
                <ChoiceSelect form={form} path="disability" options={DISABILITIES} placeholder="Select" />
              </Field>
            )}
            {text("medicalNotes", "Medical conditions / allergy", 300, "Asthma, allergic to peanuts...")}
            {text("feeConcession", "Fee concession", 80, "50% tuition, staff ward...")}
            {text("transportRoute", "Transport route", 60, "Route 3")}
            {text("transportStop", "Transport stop", 60, "MP Nagar")}
          </div>
          {(asks(rules, "rteSeat") || asks(rules, "bpl")) && (
            <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-xl bg-background px-4 py-3">
              {asks(rules, "rteSeat") && <Switch checked={values.rteSeat} onChange={(on) => form.set("rteSeat", on)} hint="A free seat under the Right to Education Act">
                  RTE seat
                </Switch>}
              {asks(rules, "bpl") && <Switch checked={values.bpl} onChange={(on) => form.set("bpl", on)} hint="Below the poverty line">
                  BPL family
                </Switch>}
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-foreground-muted">Nothing here is needed to admit the student. Press Show to fill it in.</p>
      )}
    </FormCard>
  );
}
