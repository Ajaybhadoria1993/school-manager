import { useState } from "react";
import { Plus } from "lucide-react";
import { STANDARD_CLASSES } from "../../../constants/academics";
import { useAddClassesToDepartmentMutation, useCreateClassMutation } from "../../../redux/api/academicsApi";
import { getApiError } from "../../../utils/apiErrors";
import { keyOf } from "../../../utils/academics";
import type { AcademicStructure, DepartmentItem } from "../../../types";
import { Button } from "../../ui/Button";
import { ComboBox, type ComboOption } from "../../ui/ComboBox";
import { useToast } from "../../ui/toast-context";

/** "  class   13 " -> "class 13": the spaces around and inside are tidied, the caps the person typed are kept. */
const tidy = (text: string) => text.trim().replace(/\s+/g, " ");

/**
 * Every class the person could add: first the classes the school already has (each says where it is: one in no department is moved
 * here, one that is already here or in another department is shown but cannot be picked), then the standard classes of an Indian
 * school (Pre-Nursery to Class 12) that the school does not have yet, each marked "New class".
 */
function choicesFor(structure: AcademicStructure, department: DepartmentItem | null): ComboOption[] {
  const byKey = new Map(structure.classes.map((c) => [keyOf(c.name), c]));
  const departmentNames = new Map(structure.departments.map((d) => [d.id, d.name]));
  const here = department?.id ?? null;
  const listed = new Set<string>();
  const choices: ComboOption[] = [];

  const list = (name: string) => {
    const key = keyOf(name);
    if (listed.has(key)) return;
    listed.add(key);
    const existing = byKey.get(key);
    if (!existing) choices.push({ value: name, note: "New class" });
    else if ((existing.departmentId ?? null) === here) choices.push({ value: existing.name, note: "In school · already here", disabled: true });
    else if (!existing.departmentId) choices.push({ value: existing.name, note: "In school · no department: moves here" });
    else choices.push({ value: existing.name, note: `In school · ${departmentNames.get(existing.departmentId) ?? "another department"}`, disabled: true });
  };
  // What the school already has comes first, so it is clear what exists; then the usual classes it does not have yet.
  structure.classes.forEach((c) => list(c.name));
  STANDARD_CLASSES.forEach((c) => list(c.name));
  return choices;
}

/**
 * One box to add a class to a department (or, with no department, to the classes that are in none): open the list and pick, or
 * type to search, and picking a row adds it at once. A name that is not in the list is typed and added with Enter or the button.
 */
export function AddClassBar({
  department,
  structure,
  autoFocus,
}: {
  department: DepartmentItem | null;
  structure: AcademicStructure;
  autoFocus?: boolean;
}) {
  const { push } = useToast();
  const [addClasses] = useAddClassesToDepartmentMutation();
  const [createClass] = useCreateClassMutation();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(name: string) {
    if (busy) return;
    const existing = structure.classes.find((c) => keyOf(c.name) === keyOf(name));
    setBusy(true);
    try {
      if (department) {
        await addClasses({
          id: department.id,
          classIds: existing && !existing.departmentId ? [existing.id] : [],
          names: existing ? [] : [name],
          sectionCount: 0,
        }).unwrap();
      } else {
        await createClass({ name, departmentId: null, sectionCount: 0 }).unwrap();
      }
      push("success", department ? `${existing?.name ?? name} added to ${department.name}` : `${name} added`);
      setText("");
    } catch (err) {
      push("error", getApiError(err)?.message ?? `Could not add ${name}.`);
    } finally {
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = tidy(text);
    if (name) add(name);
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-w-0 items-center gap-2">
      <div className="min-w-0 flex-1">
        <ComboBox
          aria-label={department ? `Add a class to ${department.name}` : "Add a class"}
          value={text}
          placeholder="Add a class: search, or type your own"
          options={choicesFor(structure, department)}
          onChange={setText}
          onSelect={add}
          autoFocus={autoFocus}
        />
      </div>
      <Button type="submit" loading={busy} disabled={!tidy(text)} aria-label="Add this class" className="shrink-0">
        {!busy && <Plus className="size-4" aria-hidden />}
        Add
      </Button>
    </form>
  );
}
