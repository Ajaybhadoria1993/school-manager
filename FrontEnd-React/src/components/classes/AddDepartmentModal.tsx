import { useState } from "react";
import { Check, FolderPlus, PencilLine } from "lucide-react";
import { Button } from "@heroui/react";
import { useAssignDepartmentMutation } from "../../redux/api/academicsApi";
import { departmentChoices, departmentIcon, departmentTone, keyOf, OTHER, plural, usualClassIds } from "../../utils/academics";
import type { ClassItem, DepartmentItem } from "../../types";
import { AppModal, ModalError } from "../ui/AppModal";
import { ChipPicker, type Chip } from "../ui/ChipPicker";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { useToast } from "../ui/toast-context";
import { useSave } from "./useSave";

const FORM_ID = "add-department-form";

/**
 * Add a department and say which classes go in it, in one step. The name is picked from the usual wings (one click on a chip)
 * or, with **Other...**, typed, so a school with its own name is not stuck; a name the school already has is reused. Below it, every class that is
 * in no department yet can be ticked: picking "Pre-Primary" ticks Nursery, LKG and UKG by itself, and a name we have no usual
 * classes for ticks all of them (the person came here to put these classes somewhere). The ticks can always be changed;
 * nothing is saved until the button is pressed.
 */
export function AddDepartmentModal({
  classes,
  departments,
  onClose,
}: {
  /** The classes that are in no department yet. */
  classes: ClassItem[];
  departments: DepartmentItem[];
  onClose: () => void;
}) {
  const { push } = useToast();
  const [assign] = useAssignDepartmentMutation();
  const [name, setName] = useState("");
  // True once **Other...** is picked: the box for a name of your own is open.
  const [other, setOther] = useState(false);
  // null = the ticks follow the name; once the person ticks or unticks a class, those ticks are theirs.
  const [manual, setManual] = useState<ReadonlySet<string> | null>(null);
  const [tooShort, setTooShort] = useState(false);
  const { busy, error, run, clearError } = useSave(onClose);

  const clean = name.trim().replace(/\s+/g, " ");
  const existing = departments.find((d) => keyOf(d.name) === keyOf(clean));
  const picked = manual ?? new Set(clean ? (usualClassIds(clean, classes) ?? classes.map((c) => c.id)) : []);
  const count = picked.size;
  const nothingToDo = !!existing && count === 0;

  const choices = departmentChoices(departments);
  const chips: Chip[] = [
    ...choices.map((c) => ({
      value: c.name,
      label: c.name,
      icon: departmentIcon(c.name),
      // A department the school has keeps its colour from the list page; a new one is the page's blue.
      tone: c.exists ? departmentTone(departments.findIndex((d) => keyOf(d.name) === keyOf(c.name))) : ("primary" as const),
      note: c.exists ? "In school" : undefined,
    })),
    { value: OTHER, label: "Other...", icon: PencilLine },
  ];
  const pickedChip = other ? OTHER : (choices.find((c) => keyOf(c.name) === keyOf(clean))?.name ?? "");

  function changeName(next: string) {
    setName(next);
    setTooShort(false);
    clearError();
  }
  function pickChip(value: string) {
    setOther(value === OTHER);
    changeName(value === OTHER ? "" : value);
  }

  function toggle(id: string) {
    const next = new Set(picked);
    if (!next.delete(id)) next.add(id);
    setManual(next);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!clean) return setTooShort(true);
    if (nothingToDo) return;
    run(async () => {
      const { data } = await assign({ name: clean, classIds: classes.filter((c) => picked.has(c.id)).map((c) => c.id) }).unwrap();
      const into = data.department.name;
      push(
        "success",
        data.created
          ? data.assigned > 0
            ? `${into} created with ${plural(data.assigned, "class")}`
            : `${into} created`
          : `${plural(data.assigned, "class")} moved into ${into}`
      );
    });
  }

  const hint = !clean
    ? "Pick one of the usual names, or choose Other... and type a name of your own, such as Junior Wing."
    : existing
      ? `You already have "${existing.name}". The classes you tick are put into it.`
      : `"${clean}" is new. It is created, and the classes you tick are put into it.`;

  const label = existing
    ? count > 0
      ? `Put ${plural(count, "class")} in ${existing.name}`
      : "Tick a class first"
    : count > 0
      ? `Create and add ${plural(count, "class")}`
      : "Create department";

  return (
    <AppModal
      title="Add a department"
      icon={FolderPlus}
      size="lg"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onPress={onClose} isDisabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" isPending={busy} isDisabled={nothingToDo}>
            {label}
          </Button>
        </>
      }
    >
      <p className="text-sm text-foreground-muted">
        A department groups classes that belong together, such as Primary (Class 1 to 5) or Middle (Class 6 to 8). It is only a heading.
      </p>

      <form id={FORM_ID} onSubmit={submit} noValidate className="space-y-5">
        <Field
          id="add-department-name"
          label="Department"
          hint={hint}
          error={tooShort ? "Pick a department or type a name." : undefined}
        >
          <div className="space-y-2.5">
            <ChipPicker label="Department" value={pickedChip} options={chips} onChange={pickChip} />
            {other && (
              <Input
                id="add-department-name"
                aria-label="Department: type a name"
                aria-invalid={tooShort || undefined}
                value={name}
                maxLength={60}
                autoFocus
                autoComplete="off"
                placeholder="Type the department name, for example Junior Wing"
                className="fade-in"
                onChange={(e) => changeName(e.target.value)}
              />
            )}
          </div>
        </Field>

        {classes.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <span className="text-sm font-semibold text-foreground">
                Classes to put in it <span className="font-normal text-foreground-muted">({count} of {classes.length} ticked)</span>
              </span>
              <span className="flex gap-3 text-xs font-semibold">
                <button
                  type="button"
                  className="text-primary-deep underline-offset-2 hover:underline"
                  onClick={() => setManual(new Set(classes.map((c) => c.id)))}
                >
                  Tick all
                </button>
                <button type="button" className="text-foreground-muted underline-offset-2 hover:underline" onClick={() => setManual(new Set())}>
                  Clear
                </button>
              </span>
            </legend>
            <p className="mb-2.5 text-xs text-foreground-muted">These classes are not in any department yet.</p>
            <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto p-0.5 sm:grid-cols-3">
              {classes.map((c) => (
                <label key={c.id} className="relative block cursor-pointer">
                  <input type="checkbox" className="peer sr-only" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                  <span className="flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground transition-all duration-150 hover:border-primary/50 peer-checked:border-primary peer-checked:bg-primary-soft peer-checked:text-primary-deep peer-checked:[&_svg]:opacity-100 peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20">
                    <Check className="size-4 shrink-0 opacity-0 transition-opacity" aria-hidden />
                    <span className="truncate">{c.name}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <ModalError message={error?.message ?? null} />
      </form>
    </AppModal>
  );
}
