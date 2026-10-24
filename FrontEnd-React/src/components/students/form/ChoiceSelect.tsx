import { fieldId, type StudentForm } from "../../../hooks/useStudentForm";
import { getAt } from "../../../utils/students";
import { Select } from "../../ui/Select";

/** The dropdowns' row for "nothing chosen": the form keeps an empty text for it. */
const NONE = "none";

/**
 * A dropdown for one detail of the form at `path` (category, blood group, religion, disability...), with a first row that clears it
 * ("Not given"), so an optional detail can be emptied again. The app's one Select underneath.
 */
export function ChoiceSelect({
  form,
  path,
  options,
  placeholder,
  emptyLabel = "Not given",
}: {
  form: StudentForm;
  path: string;
  options: readonly string[];
  placeholder: string;
  emptyLabel?: string;
}) {
  const value = String(getAt(form.values, path) ?? "");
  return (
    <Select
      id={fieldId(path)}
      value={value || ""}
      options={[{ value: NONE, label: emptyLabel }, ...options.map((o) => ({ value: o, label: o }))]}
      placeholder={placeholder}
      invalid={!!form.errorOf(path)}
      onChange={(next) => {
        form.set(path, next === NONE ? "" : next);
        form.touch(path);
      }}
    />
  );
}
