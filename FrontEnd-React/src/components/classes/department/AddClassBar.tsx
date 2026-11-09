import { useRef, useState } from "react";
import { Plus, Users } from "lucide-react";
import { MAX_CLASS_CAPACITY, STANDARD_CLASSES } from "../../../constants/academics";
import { useAddClassesToDepartmentMutation, useCreateClassMutation } from "../../../redux/api/academicsApi";
import { getApiError } from "../../../utils/apiErrors";
import { classSeatsProblem, keyOf } from "../../../utils/academics";
import type { AcademicStructure, DepartmentItem } from "../../../types";
import { Button } from "../../ui/Button";
import { ComboBox, type ComboOption } from "../../ui/ComboBox";
import { Input } from "../../ui/Input";
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
 * type to search. A class the school already has (one in no department) is moved here the moment it is picked, and keeps its seats.
 * A class that is new needs its seats first, so a small Seats box appears beside the name: fill it and press Add (or Enter).
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
  const [seats, setSeats] = useState("");
  const [seatsError, setSeatsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seatsBox = useRef<HTMLInputElement>(null);

  const find = (name: string) => structure.classes.find((c) => keyOf(c.name) === keyOf(name));
  const name = tidy(text);
  const isNew = !!name && !find(name);

  async function add(className: string) {
    if (busy) return;
    const existing = find(className);
    if (!existing) {
      const problem = classSeatsProblem(seats);
      if (problem) {
        setSeatsError(problem);
        seatsBox.current?.focus();
        return;
      }
    }
    const capacity = Number(seats.trim());
    setBusy(true);
    try {
      if (department) {
        await addClasses({
          id: department.id,
          classIds: existing && !existing.departmentId ? [existing.id] : [],
          names: existing ? [] : [className],
          ...(existing ? {} : { capacity }),
          sectionCount: 0,
        }).unwrap();
      } else {
        await createClass({ name: className, departmentId: null, capacity, sectionCount: 0 }).unwrap();
      }
      push("success", department ? `${existing?.name ?? className} added to ${department.name}` : `${className} added`);
      setText("");
      setSeats("");
      setSeatsError(null);
    } catch (err) {
      const refused = getApiError(err);
      const aboutSeats = Array.isArray(refused?.details) && (refused.details as { path?: string }[]).some((d) => d.path === "capacity");
      if (aboutSeats) setSeatsError(refused?.message ?? "Check the seats.");
      else push("error", refused?.message ?? `Could not add ${className}.`);
    } finally {
      setBusy(false);
    }
  }

  /** A row was picked: a class the school has is moved here at once; a new one waits for its seats. */
  function pick(picked: string) {
    if (find(picked)) void add(picked);
    else {
      setText(picked);
      setSeatsError(null);
      requestAnimationFrame(() => seatsBox.current?.focus());
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name) void add(name);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="min-w-[10rem] flex-1">
          <ComboBox
            aria-label={department ? `Add a class to ${department.name}` : "Add a class"}
            value={text}
            placeholder="Add a class: search, or type your own"
            options={choicesFor(structure, department)}
            onChange={setText}
            onSelect={pick}
            autoFocus={autoFocus}
          />
        </div>
        {isNew && (
          <div className="fade-in w-28 shrink-0">
            <Input
              ref={seatsBox}
              icon={Users}
              inputMode="numeric"
              aria-label={`Seats of ${name}`}
              aria-invalid={seatsError ? true : undefined}
              value={seats}
              maxLength={String(MAX_CLASS_CAPACITY).length}
              placeholder="Seats"
              autoComplete="off"
              onChange={(e) => {
                setSeats(e.target.value);
                setSeatsError(null);
              }}
            />
          </div>
        )}
        <Button type="submit" loading={busy} disabled={!name} aria-label="Add this class" className="shrink-0">
          {!busy && <Plus className="size-4" aria-hidden />}
          Add
        </Button>
      </div>
      {isNew && !seatsError && <p className="text-xs text-foreground-muted">{name} is a new class: enter how many students it can take, then press Add.</p>}
      {seatsError && (
        <p role="alert" className="text-xs font-medium text-danger">
          {seatsError}
        </p>
      )}
    </form>
  );
}
