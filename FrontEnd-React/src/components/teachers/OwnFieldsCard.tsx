import { ListPlus } from "lucide-react";
import type { CustomFieldDef } from "../../constants/studentFields";
import { ownFieldId, type OwnValues } from "../../utils/teacherOwn";
import { FormCard } from "../students/form/FormCard";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { TEACHER_GRID } from "./TeacherFields";

/** "No answer" in a list (a dropdown cannot show an empty value as picked). */
const NONE = "none";

/**
 * The school's own fields on Add teacher and Change teacher, in one card: a box for each, by its kind (text, a number, a day, a list, a
 * yes / no). A needed one shows the star, the others say they are optional; a wrong or missing answer says so under its box once the
 * person has pressed Next / Save (`errors`, by field key). Nothing is sent from here: the page sends the answers with the teacher.
 */
export function OwnFieldsCard({
  fields,
  values,
  errors,
  onChange,
  index = 0,
}: {
  fields: readonly CustomFieldDef[];
  values: OwnValues;
  errors: Record<string, string | undefined>;
  onChange: (key: string, value: string) => void;
  index?: number;
}) {
  return (
    <FormCard index={index} icon={ListPlus} tone="success" title="Your own fields">
      <div className={TEACHER_GRID}>
        {fields.map((f) => {
          const id = ownFieldId(f.key);
          const value = values[f.key] ?? "";
          const needed = f.mode === "required" && f.type !== "yesNo";
          return (
            <Field key={f.key} id={id} label={f.label} optional={!needed} error={errors[f.key]}>
              {f.type === "choice" || f.type === "yesNo" ? (
                <Select
                  id={id}
                  value={value === "" ? NONE : value}
                  invalid={!!errors[f.key]}
                  options={[
                    { value: NONE, label: "No answer" },
                    ...(f.type === "yesNo" ? [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] : f.options.map((o) => ({ value: o, label: o }))),
                  ]}
                  onChange={(next) => onChange(f.key, next === NONE ? "" : next)}
                />
              ) : (
                <Input
                  id={id}
                  type={f.type === "date" ? "date" : "text"}
                  inputMode={f.type === "number" ? "decimal" : undefined}
                  value={value}
                  autoComplete="off"
                  aria-invalid={errors[f.key] ? true : undefined}
                  aria-describedby={errors[f.key] ? `${id}-error` : undefined}
                  onChange={(e) => onChange(f.key, e.target.value)}
                />
              )}
            </Field>
          );
        })}
      </div>
    </FormCard>
  );
}
