import { useEffect, useState } from "react";
import { CircleCheck, Plus, Save, Trash2 } from "lucide-react";
import { TONES } from "../../../constants/tones";
import {
  useDeleteClassMutation,
  useDeleteSectionMutation,
  useGetClassQuery,
  useUpdateAcademicSettingsMutation,
  useUpdateClassMutation,
  useUpdateSectionMutation,
  refreshClass,
} from "../../../redux/api/academicsApi";
import { useClassDraft } from "../../../hooks/useClassDraft";
import { useAppDispatch } from "../../../redux/hooks";
import { getApiError } from "../../../utils/apiErrors";
import { classMark, departmentIcon, nextSectionName, plural, toneOf } from "../../../utils/academics";
import { cn } from "../../../utils/helpers";
import type { AcademicStructure, SectionInput, SectionItem } from "../../../types";
import { Button } from "../../ui/Button";
import { ChipPicker, type Chip } from "../../ui/ChipPicker";
import { InfoTip, WithTip } from "../../ui/Hint";
import { Skeleton } from "../../ui/Skeleton";
import { Switch } from "../../ui/Switch";
import { useToast } from "../../ui/toast-context";
import { ConfirmModal } from "../ConfirmModal";
import { AddSectionModal } from "./AddSectionModal";
import { ClassNameField } from "./ClassNameField";
import { FIELD_TITLE } from "./fieldStyles";
import { SectionCard } from "./SectionCard";

/**
 * The class picked in the list: its name and each of its sections as a card. Nothing is sent to the server while you type: the one
 * Save in the header (dimmed until something is changed) saves the class name and every changed section together, next to Delete, which
 * deletes the class (it asks first).
 * Its department is not asked for: inside a department the class is already there. Only a class that is in no department (the "Other
 * classes" screen) shows a row of the school's departments, and one click puts it in one. It is read from the server by the class's id,
 * so it stays right whatever the list shows. Deleting (the class or a section) is the one thing that asks first.
 */
export function ClassDetail({
  classId,
  structure,
  onGone,
  onMoved,
}: {
  classId: string;
  structure: AcademicStructure;
  /** The class was deleted. */
  onGone: () => void;
  /** The class was put in a department, so it is about to leave the list: the page keeps it open on the right. */
  onMoved: () => void;
}) {
  const { push } = useToast();
  // Once the class is being deleted it stops being read: the refresh that follows the delete would only ask for a class that is gone.
  const [leaving, setLeaving] = useState(false);
  const { data, error } = useGetClassQuery(classId, { skip: leaving });
  const [updateClass] = useUpdateClassMutation();
  const dispatch = useAppDispatch();
  const [updateSettings, { isLoading: savingSettings }] = useUpdateAcademicSettingsMutation();
  const [updateSection] = useUpdateSectionMutation();
  const [deleteClass] = useDeleteClassMutation();
  const [deleteSection] = useDeleteSectionMutation();
  // The "Add section" dialog (it asks for the seats and the room when the school requires them).
  const [addingSection, setAddingSection] = useState(false);
  // Whether a section needs its seats and room is the school's switch, kept on the server (which enforces it): this screen follows it.
  const required = structure.settings.sectionDetailsRequired;
  // Everything typed and not saved yet: the class name and each section's boxes.
  const draft = useClassDraft(data?.data, required);
  // The department chip that was just pressed (a class that is in no department is being put in one), shown as picked at once; it is
  // dropped when the class read from the server agrees (or when the move fails), so the chips never wait for the round trip and
  // never keep a pick the server did not make.
  const [pendingDepartment, setPendingDepartment] = useState<string | null>(null);
  const serverDepartment = data?.data?.departmentId ?? null;
  useEffect(() => {
    if (pendingDepartment !== null && pendingDepartment === serverDepartment) setPendingDepartment(null);
  }, [pendingDepartment, serverDepartment]);
  // What is being asked about is kept as it was when asked, so the question (and an answer such as "this class has students")
  // stays on screen even while the class itself is being read again or has just gone.
  const [asking, setAsking] = useState<
    { kind: "class"; name: string; sectionCount: number } | { kind: "section"; className: string; section: SectionItem } | null
  >(null);

  const questions = asking && (
    <>
      {asking.kind === "section" && (
        <ConfirmModal
          title={`Delete ${asking.className} - ${asking.section.name}?`}
          confirmLabel="Delete section"
          onClose={() => setAsking(null)}
          onConfirm={async () => {
            await deleteSection(asking.section.id).unwrap();
            push("success", `${asking.className} - ${asking.section.name} deleted`);
          }}
        >
          <p>This cannot be undone.</p>
          <p>A section that has students cannot be deleted: move the students to another section first.</p>
        </ConfirmModal>
      )}

      {asking.kind === "class" && (
        <ConfirmModal
          title={`Delete ${asking.name}?`}
          confirmLabel="Delete class"
          onClose={() => setAsking(null)}
          onConfirm={async () => {
            setLeaving(true);
            try {
              await deleteClass(classId).unwrap();
            } catch (err) {
              setLeaving(false);
              throw err;
            }
            push("success", `${asking.name} deleted`);
            onGone();
          }}
        >
          <p>
            {asking.sectionCount === 1
              ? "Its section is deleted with it. "
              : asking.sectionCount > 1
                ? `Its ${asking.sectionCount} sections are deleted with it. `
                : ""}
            This cannot be undone.
          </p>
          <p>A class that has students cannot be deleted: move the students to another class first.</p>
        </ConfirmModal>
      )}
    </>
  );

  const classItem = data?.data;
  if (!classItem) {
    return (
      <>
        {error ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-semibold text-foreground">This class is not in your school any more.</p>
            <p className="mt-1 text-sm text-foreground-muted">Pick another class from the list.</p>
          </div>
        ) : (
          <div className="space-y-4 p-5" aria-busy="true">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-8 w-1/3 rounded-lg" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
        )}
        {questions}
      </>
    );
  }

  const t = TONES[toneOf(structure, classItem.departmentId)];
  const { sections } = classItem;
  const seats = sections.reduce((sum, s) => sum + (s.capacity ?? 0), 0);
  const next = nextSectionName(sections.map((s) => s.name));
  // Inside a department the class is already where it belongs, so there is nothing to choose. Only a class that is in no department
  // (the "Other classes" screen) is offered the school's departments, because giving it one is what that screen is for.
  const unplaced = !classItem.departmentId && structure.departments.length > 0;
  const departmentChips: Chip[] = structure.departments.map((d) => ({ value: d.id, label: d.name, icon: departmentIcon(d.name), tone: toneOf(structure, d.id) }));

  /** The class name's part of Save: what is wrong (a name already used) is returned to show under its box. */
  async function rename(name: string): Promise<string | void> {
    if (!name) return "Enter the class name.";
    try {
      // `refresh: false`: the one Save asks for the new state once, after all of its changes were sent.
      await updateClass({ id: classId, name, refresh: false }).unwrap();
    } catch (err) {
      return getApiError(err)?.message ?? "Could not rename the class.";
    }
  }

  /** A department chip was picked for a class that is in none: it moves there at once. */
  async function moveTo(id: string) {
    if (!classItem) return;
    setPendingDepartment(id);
    try {
      await updateClass({ id: classId, departmentId: id }).unwrap();
      onMoved();
      push("success", `${classItem.name} moved to ${structure.departments.find((d) => d.id === id)?.name ?? "the department"}`);
    } catch (err) {
      setPendingDepartment(null);
      push("error", getApiError(err)?.message ?? `Could not move ${classItem.name}.`);
    }
  }

  /** Flips the school's rule at once (it is a setting, not part of Save). The server keeps it and enforces it from then on. */
  async function toggleRequired(next: boolean) {
    try {
      await updateSettings({ sectionDetailsRequired: next }).unwrap();
      push("success", next ? "Seats and room are now required for every section" : "Seats and room are now optional for every section");
    } catch (err) {
      push("error", getApiError(err)?.message ?? "Could not change this setting.");
    }
  }

  /** A section's part of Save: only the boxes that changed are sent. Returns what is wrong, for the card to show. */
  async function saveSection(section: SectionItem, changes: Partial<SectionInput>): Promise<string | void> {
    try {
      await updateSection({ id: section.id, ...changes, refresh: false }).unwrap();
    } catch (err) {
      return getApiError(err)?.message ?? "Could not save this section.";
    }
  }

  /** The one Save: the class name first, then each changed section; what failed is shown where it belongs. */
  function submit(e: React.FormEvent) {
    e.preventDefault();
    void draft.save({ renameClass: rename, saveSection }).then((saved) => {
      // One refresh for the whole Save (the layout, the list's rows and this class), not one for each request it sent.
      if (saved) dispatch(refreshClass());
    });
  }

  return (
    <>
    <form onSubmit={submit} noValidate className="fade-in">
      <div className={cn("space-y-3 bg-gradient-to-r to-transparent px-5 py-5", t.wash)}>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <span aria-hidden className={cn("flex size-14 shrink-0 items-center justify-center rounded-2xl text-xl font-extrabold tracking-tight", t.gradient)}>
            {classMark(classItem.name)}
          </span>
          <ClassNameField
            name={classItem.name}
            value={draft.className}
            problem={draft.classNameProblem}
            dirty={draft.classNameDirty}
            onChange={draft.changeClassName}
            onRevert={draft.revertClassName}
          />
          {/* The class's actions, together and at the right: Save (dimmed until something changes) and, set apart, Delete. */}
          <div className="ml-auto flex items-center gap-2">
            <Button type="submit" loading={draft.saving} disabled={!draft.dirty} aria-label="Save changes">
              {!draft.saving && <Save className="size-4" aria-hidden />}
              Save
            </Button>
            <span aria-hidden className="mx-1 h-6 w-px bg-border" />
            <Button
              type="button"
              variant="ghost"
              aria-label={`Delete ${classItem.name}`}
              className="text-danger hover:bg-danger-soft hover:text-danger"
              onClick={() => setAsking({ kind: "class", name: classItem.name, sectionCount: sections.length })}
            >
              <Trash2 className="size-4" aria-hidden />
              Delete
            </Button>
          </div>
        </div>

        <p aria-live="polite" className="min-h-5 text-xs font-semibold">
          {draft.summaryProblem ? (
            <span role="alert" className="font-medium text-danger">
              {draft.summaryProblem}
            </span>
          ) : draft.justSaved ? (
            <span className="inline-flex items-center gap-1 text-success">
              <CircleCheck className="size-3.5" aria-hidden />
              Saved
            </span>
          ) : null}
        </p>

        {unplaced && (
          <div>
            <p className={FIELD_TITLE}>Put {classItem.name} in a department</p>
            <ChipPicker label={`Department of ${classItem.name}`} value={pendingDepartment ?? ""} options={departmentChips} onChange={moveTo} />
            <p className="mt-1.5 text-xs text-foreground-muted">It is in no department yet. Pick one and it moves there.</p>
          </div>
        )}
      </div>

      <div className="space-y-4 px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold tracking-tight text-foreground">Sections</h2>
            <p className="text-xs text-foreground-muted">
              {sections.length === 0 ? "Not split into sections" : plural(sections.length, "section")}
              {seats > 0 && <> · {seats} seats</>}
              {/* Sections belong to one session; next year's may differ. */}
              {structure.academicYear && <> · for {structure.academicYear.name}</>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-1">
              <Switch checked={required} busy={savingSettings} onChange={toggleRequired}>
                Seats and room required
              </Switch>
              <InfoTip label="What does this switch do?">
                On: every section must have its seats and its room, and the server refuses one without them. Off: both are optional. It
                applies to every class in your school.
              </InfoTip>
            </div>
            {next && (
              <WithTip tip={`Adds section ${next} to ${classItem.name}.`}>
                <Button type="button" variant="outline" onClick={() => setAddingSection(true)} aria-label={`Add section ${next} to ${classItem.name}`}>
                  <Plus className="size-4" aria-hidden />
                  Section {next}
                </Button>
              </WithTip>
            )}
          </div>
        </div>

        {sections.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-background px-4 py-6 text-center text-sm text-foreground-muted">
            {classItem.name} has no sections, so the whole class sits together. If it is split into groups, add them with the Section{" "}
            {next || "A"} button, one after another.
          </p>
        ) : (
          // Two cards side by side when the space beside the list is wide enough, one under the other when it is not.
          <div className="@container">
            <ul className="grid gap-3 @2xl:grid-cols-2">
              {sections.map((s) => (
                <SectionCard
                  key={s.id}
                  className={classItem.name}
                  section={s}
                  tone={toneOf(structure, classItem.departmentId)}
                  values={draft.sectionValues(s)}
                  problems={draft.sectionProblems(s)}
                  dirty={draft.sectionDirty(s)}
                  required={required}
                  onChange={(field, value) => draft.changeSection(s, field, value)}
                  onRevert={() => draft.revertSection(s)}
                  onDelete={() => setAsking({ kind: "section", className: classItem.name, section: s })}
                />
              ))}
            </ul>
          </div>
        )}
      </div>

    </form>

    {/* Outside the form: a dialog's events reach the form around it even though it is drawn elsewhere, and its submit must not be this form's Save. */}
    {addingSection && (
      <AddSectionModal classId={classId} className={classItem.name} suggestedName={next} required={required} onClose={() => setAddingSection(false)} />
    )}
    {questions}
    </>
  );
}
