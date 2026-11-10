import type { ReactNode } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { isMovableKey, type AdmitStepKey, type MovableKey, type Placement } from "../../../constants/studentFields";
import type { StudentForm } from "../../../hooks/useStudentForm";
import { isAsked } from "../../../utils/admitSteps";
import { isTick } from "../../../utils/exportLayout";
import { keysIn } from "../../../utils/placement";
import { Button } from "../../ui/Button";
import { CustomBox, CustomTick, FieldBox, TickBox } from "./FieldBox";
import { FormSection } from "./FormSection";
import { FORM_GRID } from "./formGrid";

/**
 * The details a school placed in one step of Add student (Manage fields > where each detail goes): the ones of its list that it asks
 * (Aadhaar, blood group, transport...) and its own fields, in the order it gave them; the yes / no ticks come last, in one row. No card
 * when nothing the school asks is placed in the step. `onAddField` adds the "Add your own field" button (More details).
 */
export function PlacedFields({
  form,
  step,
  placements,
  index = 0,
  title,
  onAddField,
}: {
  form: StudentForm;
  step: AdmitStepKey;
  placements: readonly Placement[];
  index?: number;
  /** The card's title: the name of a step the school added; More details or Other details by default. */
  title?: string;
  onAddField?: () => void;
}) {
  const asked = keysIn(placements, step).filter((key) => isAsked(key, form.rules, form.custom));
  if (asked.length === 0) return null;

  const isTickKey = (key: string) => (isMovableKey(key) ? isTick(key) : form.custom.find((f) => f.key === key)?.type === "yesNo");
  const show = (key: string): ReactNode => {
    const own = form.custom.find((f) => f.key === key);
    if (own) return own.type === "yesNo" ? <CustomTick key={key} form={form} field={own} /> : <CustomBox key={key} form={form} field={own} />;
    return isTick(key as MovableKey) ? <TickBox key={key} form={form} rule={key as MovableKey} /> : <FieldBox key={key} form={form} rule={key as MovableKey} />;
  };
  const boxes = asked.filter((key) => !isTickKey(key));
  const ticks = asked.filter(isTickKey);

  return (
    <FormSection
      index={index}
      icon={ClipboardList}
      title={title ?? (step === "more" ? "More details" : "Other details")}
      action={
        onAddField && (
          <Button type="button" variant="outline" size="sm" onClick={onAddField}>
            <Plus className="size-4" aria-hidden />
            Add your own field
          </Button>
        )
      }
    >
      <div className="space-y-4">
        {boxes.length > 0 && <div className={FORM_GRID}>{boxes.map(show)}</div>}
        {ticks.length > 0 && <div className="flex flex-wrap gap-x-8 gap-y-3 rounded-xl bg-background px-4 py-3">{ticks.map(show)}</div>}
      </div>
    </FormSection>
  );
}
