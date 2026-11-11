import { useState } from "react";
import { ChevronDown, ClipboardList } from "lucide-react";
import { STUDENT_FORM_FIELDS, type FormFieldKey, type MovableKey } from "../../../constants/studentFields";
import type { StudentForm } from "../../../hooks/useStudentForm";
import { asks, mayLeave } from "../../../utils/fieldRules";
import { cn } from "../../../utils/helpers";
import { FieldBox, TickBox } from "./FieldBox";
import { FormSection } from "./FormSection";
import { FORM_GRID } from "./formGrid";

/** The details of this card: the personal ones, then fees and transport. */
const MORE_RULES = STUDENT_FORM_FIELDS.filter((f) => f.group === "More" && f.key !== "religion").map((f) => f.key as FormFieldKey);
const FEE_RULES = STUDENT_FORM_FIELDS.filter((f) => f.group === "Fees and transport").map((f) => f.key as FormFieldKey);
const ALL = [...MORE_RULES, ...FEE_RULES];
/** The boxes, in the order they stand; the two ticks (RTE seat, BPL family) follow them. */
const BOXES: MovableKey[] = ["nationality", "emergencyMobile", "disability", "medicalNotes", "feeConcession", "transportRoute", "transportStop"];
const TICKS: MovableKey[] = ["rteSeat", "bpl"];

/**
 * The rest a school may keep: nationality, an emergency / WhatsApp number, a disability (CWSN), medical notes, an RTE seat, a BPL family,
 * a fee concession and the school bus. It starts folded on a student's page while none of it is needed, filled or wrong; the details
 * the school does not ask for are not shown. (Add student asks these where the school placed them: see PlacedFields.)
 */
export function MoreFields({ form, startOpen, index = 0 }: { form: StudentForm; startOpen: boolean; index?: number }) {
  const { values, rules } = form;
  const shown = ALL.filter((k) => asks(rules, k));
  const needed = shown.some((k) => !mayLeave(rules, k) && k !== "rteSeat" && k !== "bpl");
  const filled = !!(values.nationality || values.emergencyMobile || values.disability || values.medicalNotes || values.feeConcession || values.transportRoute || values.transportStop || values.rteSeat || values.bpl);
  const [opened, setOpened] = useState(startOpen);
  const open = opened || needed || filled || ALL.some((k) => form.errorOf(k));
  if (shown.length === 0) return null;

  return (
    <FormSection
      index={index}
      icon={ClipboardList}
      title="More details"
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
            {BOXES.map((rule) => (
              <FieldBox key={rule} form={form} rule={rule} />
            ))}
          </div>
          {(asks(rules, "rteSeat") || asks(rules, "bpl")) && (
            <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-xl bg-background px-4 py-3">
              {TICKS.map((rule) => (
                <TickBox key={rule} form={form} rule={rule} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-foreground-muted">Nothing here is needed to admit the student. Press Show to fill it in.</p>
      )}
    </FormSection>
  );
}
