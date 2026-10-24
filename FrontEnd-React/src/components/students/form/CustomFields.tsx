import { CalendarDays, Hash, Sparkles } from "lucide-react";
import { fieldId, type StudentForm } from "../../../hooks/useStudentForm";
import { Field } from "../../ui/Field";
import { Input } from "../../ui/Input";
import { Switch } from "../../ui/Switch";
import { ChoiceSelect } from "./ChoiceSelect";
import { FormCard } from "./FormCard";
import { FORM_GRID } from "./formGrid";

/**
 * The school's own fields (made on Students > Export: a house, a bus pass number...), each in the box its kind needs: text, a number,
 * a day, a list, or a tick. Only the ones the school asks for; mandatory ones carry the star. No card when it has none.
 */
export function CustomFields({ form, index = 0 }: { form: StudentForm; index?: number }) {
  const fields = form.custom.filter((f) => f.mode !== "hidden");
  if (fields.length === 0) return null;
  const ticks = fields.filter((f) => f.type === "yesNo");
  const boxes = fields.filter((f) => f.type !== "yesNo");
  return (
    <FormCard index={index} icon={Sparkles} tone="success" title="Your school's own details" description="The fields your school added on the Export page.">
      {boxes.length > 0 && (
        <div className={FORM_GRID}>
          {boxes.map((f) => {
            const path = `custom.${f.key}`;
            return (
              <Field key={f.key} id={fieldId(path)} label={f.label} optional={f.mode !== "required"} error={form.errorOf(path)}>
                {f.type === "choice" ? (
                  <ChoiceSelect form={form} path={path} options={f.options} placeholder={`Choose the ${f.label}`} />
                ) : f.type === "date" ? (
                  <Input {...form.bind(path)} type="date" icon={CalendarDays} />
                ) : f.type === "number" ? (
                  <Input {...form.bind(path)} inputMode="decimal" icon={Hash} maxLength={16} />
                ) : (
                  <Input {...form.bind(path)} maxLength={200} />
                )}
              </Field>
            );
          })}
        </div>
      )}
      {ticks.length > 0 && (
        <div className={boxes.length > 0 ? "mt-4 flex flex-wrap gap-x-8 gap-y-3" : "flex flex-wrap gap-x-8 gap-y-3"}>
          {ticks.map((f) => (
            <Switch key={f.key} checked={form.values.custom[f.key] === true} onChange={(on) => form.set(`custom.${f.key}`, on)}>
              {f.label}
            </Switch>
          ))}
        </div>
      )}
    </FormCard>
  );
}
