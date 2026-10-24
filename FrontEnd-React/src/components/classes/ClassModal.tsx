import { useState } from "react";
import { FolderX, PencilLine, Plus } from "lucide-react";
import { Button } from "@heroui/react";
import { MAX_NEW_SECTIONS, STANDARD_CLASSES } from "../../constants/academics";
import { useCreateClassMutation } from "../../redux/api/academicsApi";
import { departmentIcon, describeSections, keyOf, NO_DEPARTMENT, OTHER, plural, toneOf } from "../../utils/academics";
import type { AcademicStructure } from "../../types";
import { AppModal, ModalError } from "../ui/AppModal";
import { ChipPicker, type Chip } from "../ui/ChipPicker";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { useToast } from "../ui/toast-context";
import { useSave } from "./useSave";

const FORM_ID = "class-form";

const SECTION_CHIPS: Chip[] = Array.from({ length: MAX_NEW_SECTIONS + 1 }, (_, n) => ({ value: String(n), label: n === 0 ? "None" : String(n) }));

/**
 * Add a class, by picking: the usual classes of a school in India that this school does not have yet are chips (one click),
 * **Other...** opens a box for a name of your own, the department is a row of chips (it follows the class you pick, until you pick
 * one yourself) and so is the number of sections, with what they will be called shown right under it. Changing a class later is
 * done from its department's Manage screen.
 */
export function ClassModal({ structure, onClose }: { structure: AcademicStructure; onClose: () => void }) {
  const { push } = useToast();
  const [create] = useCreateClassMutation();
  const have = new Set(structure.classes.map((c) => keyOf(c.name)));
  const usual = STANDARD_CLASSES.filter((c) => !have.has(keyOf(c.name)));

  const [name, setName] = useState("");
  // With every usual class already made, a name of your own is the only way to add one, so its box is open at once.
  const [other, setOther] = useState(usual.length === 0);
  const [departmentId, setDepartmentId] = useState(NO_DEPARTMENT);
  const [sectionCount, setSectionCount] = useState("1");
  const [tooShort, setTooShort] = useState(false);
  // Until the person picks a department themselves, the class picked or typed picks the department made for it (Nursery: Pre-Primary).
  const [departmentChosen, setDepartmentChosen] = useState(false);
  const { busy, error, run, clearError } = useSave(onClose);
  const clash = error?.code === "CLASS_EXISTS";

  const clean = name.trim().replace(/\s+/g, " ");

  const classChips: Chip[] = [
    ...usual.map((c) => {
      const department = structure.departments.find((d) => keyOf(d.name) === keyOf(c.department));
      return { value: c.name, label: c.name, tone: toneOf(structure, department?.id ?? null) };
    }),
    { value: OTHER, label: "Other...", icon: PencilLine },
  ];
  const departmentChips: Chip[] = [
    ...structure.departments.map((d) => ({ value: d.id, label: d.name, icon: departmentIcon(d.name), tone: toneOf(structure, d.id) })),
    { value: NO_DEPARTMENT, label: "No department", icon: FolderX, tone: "navy" as const },
  ];

  function changeName(next: string) {
    setName(next);
    setTooShort(false);
    clearError();
    if (departmentChosen) return;
    const standard = STANDARD_CLASSES.find((c) => keyOf(c.name) === keyOf(next));
    const department = standard && structure.departments.find((d) => keyOf(d.name) === keyOf(standard.department));
    setDepartmentId(department?.id ?? NO_DEPARTMENT);
  }

  function pickClass(value: string) {
    if (value === OTHER) {
      setOther(true);
      changeName("");
      return;
    }
    setOther(false);
    changeName(value);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!clean) return setTooShort(true);
    run(async () => {
      await create({
        name: clean,
        departmentId: departmentId === NO_DEPARTMENT ? null : departmentId,
        sectionCount: Number(sectionCount),
      }).unwrap();
      push("success", `${clean} added`);
    });
  }

  const count = Number(sectionCount);
  const preview = !clean
    ? "Pick a class above to see its sections."
    : count === 0
      ? `${clean} will have no sections yet. You can add them later.`
      : `${clean} will have ${plural(count, "section")}: ${describeSections(count)}.`;

  return (
    <AppModal
      title="Add a class"
      icon={Plus}
      size="lg"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onPress={onClose} isDisabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" isPending={busy}>
            Add class
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="space-y-5">
        <Field
          id="class-name"
          label="Class name"
          hint={
            usual.length === 0
              ? "You already have all the usual classes. Type a name for another one. Each class name can be used once."
              : "Pick one of the usual classes, or choose Other... and type a name of your own. Each class name can be used once."
          }
          error={clash ? error.message : tooShort ? "Pick a class or type its name." : undefined}
        >
          <div className="space-y-2.5">
            <ChipPicker label="Class name" value={other ? OTHER : name} options={classChips} onChange={pickClass} />
            {other && (
              <Input
                id="class-name"
                aria-label="Class name: type a name"
                aria-invalid={clash || tooShort || undefined}
                value={name}
                maxLength={40}
                autoFocus
                autoComplete="off"
                placeholder="Type the class name, for example Class 13"
                className="fade-in"
                onChange={(e) => changeName(e.target.value)}
              />
            )}
          </div>
        </Field>

        <Field
          id="class-department"
          label="Department"
          optional
          hint={
            structure.departments.length === 0
              ? "You have no departments yet. You can create them from the Create department button."
              : "The group this class belongs to, such as Primary. It follows the class you pick; press another one to change it."
          }
        >
          <ChipPicker
            label="Department"
            value={departmentId}
            options={departmentChips}
            onChange={(next) => {
              setDepartmentChosen(true);
              setDepartmentId(next);
            }}
          />
        </Field>

        <Field
          id="class-sections"
          label="Sections to start with"
          hint="Most classes are split into sections (5-A, 5-B). You can add, rename or remove them later."
        >
          <div className="space-y-2.5">
            <ChipPicker compact label="Sections to start with" value={sectionCount} options={SECTION_CHIPS} onChange={setSectionCount} />
            <p aria-live="polite" className="rounded-lg bg-primary-soft px-3 py-2 text-xs font-semibold text-primary-deep">
              {preview}
            </p>
          </div>
        </Field>

        <ModalError message={error && !clash ? error.message : null} />
      </form>
    </AppModal>
  );
}
