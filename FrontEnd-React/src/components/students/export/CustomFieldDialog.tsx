import { useState } from "react";
import { PencilLine, PlusSquare, Trash2 } from "lucide-react";
import {
  CUSTOM_FIELD_TYPES,
  EXPORT_COLUMNS,
  MAX_CUSTOM_LABEL,
  MAX_CUSTOM_OPTION,
  MAX_CUSTOM_OPTIONS,
  STUDENT_FORM_FIELDS,
  newCustomKey,
  type CustomFieldDef,
  type CustomFieldType,
} from "../../../constants/studentFields";
import { cn } from "../../../utils/helpers";
import { AppModal } from "../../ui/AppModal";
import { Button } from "../../ui/Button";
import { Field } from "../../ui/Field";
import { Input, Textarea } from "../../ui/Input";
import { Switch } from "../../ui/Switch";

const tidy = (text: string) => text.trim().replace(/\s+/g, " ");
/** The names of the fields on the list: a field of the school's own cannot take one (the server says the same). */
const LIST_NAMES = new Map<string, string>([
  ...EXPORT_COLUMNS.map((c) => [c.heading.toLowerCase(), c.heading] as [string, string]),
  ...STUDENT_FORM_FIELDS.map((f) => [f.label.toLowerCase(), f.label] as [string, string]),
]);

/**
 * Adds a field of the school's own, or changes one (`field`): its name (as Add student and the Excel show it), the kind of answer it
 * takes (fixed once it is added: the answers already kept would not fit another kind), the choices of a list, and Mandatory. Checked
 * with the server's words before it is kept in the page's draft; nothing is sent until the page's Save. `others` are the school's other
 * fields (two cannot share a name).
 */
export function CustomFieldDialog({
  field,
  others,
  onSave,
  onDelete,
  onClose,
}: {
  field: CustomFieldDef | null;
  others: CustomFieldDef[];
  onSave: (field: CustomFieldDef) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(field?.label ?? "");
  const [type, setType] = useState<CustomFieldType>(field?.type ?? "text");
  const [options, setOptions] = useState((field?.options ?? []).join("\n"));
  const [required, setRequired] = useState(field?.mode === "required");
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const name = tidy(label);
  const choices = options.split("\n").map(tidy).filter(Boolean);
  const labelProblem =
    name.length < 2 || name.length > MAX_CUSTOM_LABEL
      ? `The name is 2 to ${MAX_CUSTOM_LABEL} characters`
      : /[<>]/.test(name)
        ? "The name cannot contain < or >"
        : LIST_NAMES.has(name.toLowerCase())
          ? `There is already a field called ${LIST_NAMES.get(name.toLowerCase())}: switch it on in the list`
          : others.some((f) => f.label.toLowerCase() === name.toLowerCase())
            ? "Two fields cannot have the same name"
            : undefined;
  const optionsProblem =
    type !== "choice"
      ? undefined
      : choices.length === 0
        ? "Add the choices, one per line"
        : choices.length > MAX_CUSTOM_OPTIONS
          ? `Up to ${MAX_CUSTOM_OPTIONS} choices`
          : choices.some((c) => c.length > MAX_CUSTOM_OPTION || /[<>]/.test(c))
            ? `A choice is up to ${MAX_CUSTOM_OPTION} characters, without < or >`
            : new Set(choices.map((c) => c.toLowerCase())).size !== choices.length
              ? "Two choices cannot be the same"
              : undefined;

  function save() {
    setTried(true);
    if (labelProblem || optionsProblem) return;
    onSave({
      key: field?.key ?? newCustomKey(),
      label: name,
      type,
      options: type === "choice" ? choices : [],
      mode: type !== "yesNo" && required ? "required" : "optional",
    });
  }

  const editing = !!field;
  return (
    <AppModal
      title={editing ? `Change ${field.label}` : "Add your own field"}
      icon={editing ? PencilLine : PlusSquare}
      tone={confirmDelete ? "danger" : "primary"}
      onClose={onClose}
      footer={
        confirmDelete ? (
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={onDelete}>
              <Trash2 className="size-4" aria-hidden />
              Delete the field
            </Button>
          </>
        ) : (
          <>
            {editing && onDelete && (
              <Button variant="ghost" className="mr-auto text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" aria-hidden />
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save}>{editing ? "Keep the change" : "Add the field"}</Button>
          </>
        )
      }
    >
      {confirmDelete ? (
        <p className="text-sm text-foreground-muted">
          <span className="font-bold text-foreground">{field?.label}</span> leaves Add student and the Excel. What was filled in for students
          stays in their records but is no longer shown. Nothing is saved until you press Save on the page.
        </p>
      ) : (
        <>
          <Field id="custom-field-label" label="Name of the field" hint="As Add student and the Excel show it, for example House or Bus pass no." error={tried ? labelProblem : undefined}>
            <Input id="custom-field-label" value={label} maxLength={MAX_CUSTOM_LABEL + 5} autoFocus onChange={(e) => setLabel(e.target.value)} aria-invalid={tried && !!labelProblem} />
          </Field>

          <div>
            <p id="custom-field-type" className="mb-1.5 text-sm font-semibold text-foreground">
              Kind of answer
            </p>
            <div role="radiogroup" aria-labelledby="custom-field-type" className="flex flex-wrap gap-2">
              {CUSTOM_FIELD_TYPES.map((t) => {
                const on = type === t.type;
                return (
                  <button
                    key={t.type}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={editing && !on}
                    onClick={() => setType(t.type)}
                    className={cn(
                      "h-9 rounded-lg border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-40",
                      on ? "border-primary bg-primary-soft text-primary-deep" : "border-border bg-surface text-foreground hover:border-primary/40"
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-foreground-muted">
              {editing ? "The kind stays as it was added (the answers already kept would not fit another). " : ""}
              {CUSTOM_FIELD_TYPES.find((t) => t.type === type)?.hint}
            </p>
          </div>

          {type === "choice" && (
            <Field id="custom-field-options" label="Choices" hint="One per line, for example Red, Blue, Green, Yellow." error={tried ? optionsProblem : undefined}>
              <Textarea id="custom-field-options" rows={4} value={options} onChange={(e) => setOptions(e.target.value)} aria-invalid={tried && !!optionsProblem} />
            </Field>
          )}

          {type !== "yesNo" && (
            <Switch checked={required} onChange={setRequired} hint={required ? "Add student is not saved without it." : "Asked, may be left empty."}>
              {required ? "Mandatory" : "Optional"}
            </Switch>
          )}
        </>
      )}
    </AppModal>
  );
}
