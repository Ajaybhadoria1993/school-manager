import { Sparkles } from "lucide-react";
import type { StudentForm } from "../../../hooks/useStudentForm";
import { CustomBox, CustomTick } from "./FieldBox";
import { FormSection } from "./FormSection";
import { FORM_GRID } from "./formGrid";

/**
 * The school's own fields (made on Manage fields: a house, a bus pass number...), each in the box its kind needs: text, a number,
 * a day, a list, or a tick. Only the ones the school asks for; mandatory ones carry the star. No card when it has none. (Add student
 * asks them where the school placed them: see PlacedFields.)
 */
export function CustomFields({ form, index = 0 }: { form: StudentForm; index?: number }) {
  const fields = form.custom.filter((f) => f.mode !== "hidden");
  if (fields.length === 0) return null;
  const ticks = fields.filter((f) => f.type === "yesNo");
  const boxes = fields.filter((f) => f.type !== "yesNo");
  return (
    <FormSection index={index} icon={Sparkles} title="Your school's own details">
      {boxes.length > 0 && (
        <div className={FORM_GRID}>
          {boxes.map((f) => (
            <CustomBox key={f.key} form={form} field={f} />
          ))}
        </div>
      )}
      {ticks.length > 0 && (
        <div className={boxes.length > 0 ? "mt-4 flex flex-wrap gap-x-8 gap-y-3" : "flex flex-wrap gap-x-8 gap-y-3"}>
          {ticks.map((f) => (
            <CustomTick key={f.key} form={form} field={f} />
          ))}
        </div>
      )}
    </FormSection>
  );
}
