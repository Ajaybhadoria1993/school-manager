import { useEffect, useState } from "react";
import { Archive, CircleCheck, Plus, Rows3, Save } from "lucide-react";
import { TONES } from "../../../constants/tones";
import {
  useDeactivateClassMutation,
  useDeleteSectionMutation,
  useGetClassQuery,
  useUpdateAcademicSettingsMutation,
  useUpdateClassMutation,
  useUpdateSectionMutation,
  refreshClass,
} from "../../../redux/api/academicsApi";
import { useClassDraft, type ClassChanges, type ClassProblems } from "../../../hooks/useClassDraft";
import { useAppDispatch } from "../../../redux/hooks";
import { getApiError } from "../../../utils/apiErrors";
import { classMark, departmentIcon, nextSectionName, plural, sectionSeats, toneOf } from "../../../utils/academics";
import { cn } from "../../../utils/helpers";
import type { AcademicStructure, SectionInput, SectionItem } from "../../../types";
import { Button } from "../../ui/Button";
import { ChipPicker, type Chip } from "../../ui/ChipPicker";
import { InfoTip } from "../../ui/Hint";
import { Skeleton } from "../../ui/Skeleton";
import { Switch } from "../../ui/Switch";
import { useToast } from "../../ui/toast-context";
import { ConfirmModal } from "../ConfirmModal";
import { AddSectionModal } from "./AddSectionModal";
import { DivideClassDialog } from "./DivideClassDialog";
import { ClassNameField } from "./ClassNameField";
import { ClassSeatsField } from "./ClassSeatsField";
import { FIELD_TITLE } from "./fieldStyles";
import { InactiveClassView } from "./InactiveClassView";
import { SectionCard } from "./SectionCard";

/**
 * The one line under the class's name, only when it has something to say: that the seats are not set (a warning), or how much of the
 * class's seats its sections hold. A class without sections has nothing to add to the box above. It reads what is saved, not what is
 * being typed.
 */
function seatsSummary(c: { capacity: number | null; sections: unknown[] }, inSections: number): { text: string; warn: boolean } | null {
  if (c.capacity === null) return { text: "Seats not set. Enter them and press Save.", warn: true };
  if (c.sections.length === 0) return null;
  const left = c.capacity - inSections;
  return {
    text: left > 0 ? `${inSections} of ${plural(c.capacity, "seat")} are in sections, ${left} free.` : `All ${plural(c.capacity, "seat")} are in sections.`,
    warn: false,
  };
}

/**
 * The class picked in the list: its name and each of its sections as a card. Nothing is sent to the server while you type: the one
 * Save in the header (dimmed until something is changed) saves the class name and every changed section together, next to Make inactive.
 * A class is never deleted (its students and their history belong to it): Make inactive asks first, and the server refuses it while
 * students are still in the class. An inactive class is shown read-only, with Make active (`InactiveClassView`).
 * Its department is not asked for: inside a department the class is already there. Only a class that is in no department (the "Other
 * classes" screen) shows a row of the school's departments, and one click puts it in one. It is read from the server by the class's id,
 * so it stays right whatever the list shows. Making the class inactive, or deleting a section, is what asks first.
 */
export function ClassDetail({
  classId,
  structure,
  onMoved,
}: {
  classId: string;
  structure: AcademicStructure;
  /** The class was put in a department, so it is about to leave the list: the page keeps it open on the right. */
  onMoved: () => void;
}) {
  const { push } = useToast();
  const { data, error } = useGetClassQuery(classId);
  const [updateClass] = useUpdateClassMutation();
  const dispatch = useAppDispatch();
  const [updateSettings, { isLoading: savingSettings }] = useUpdateAcademicSettingsMutation();
  const [updateSection] = useUpdateSectionMutation();
  const [deactivateClass] = useDeactivateClassMutation();
  const [deleteSection] = useDeleteSectionMutation();
  // The "Add section" dialog (it asks for the seats and the room when the school requires them).
  const [addingSection, setAddingSection] = useState(false);
  // The divide window: the class has students sitting in it, so its first sections are made by dividing it (how many students it holds).
  const [dividing, setDividing] = useState<number | null>(null);
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
          title={`Make ${asking.name} inactive?`}
          confirmLabel="Make inactive"
          icon={Archive}
          tone="primary"
          onClose={() => setAsking(null)}
          onConfirm={async () => {
            // The class stays on screen, now marked inactive (the answer re-reads it), with Make active.
            await deactivateClass(classId).unwrap();
            push("success", `${asking.name} is inactive. It stays in the list: open it to make it active again.`);
          }}
        >
          <p>
            It will no longer be offered when you admit a student, plan the timetable or promote students. Nothing is deleted
            {asking.sectionCount > 0 ? `: its ${asking.sectionCount === 1 ? "section" : `${asking.sectionCount} sections`}, its history and its timetable are kept` : ""}.
            You can make it active again from the Inactive list on the Classes &amp; Sections page.
          </p>
          <p>A class that still has students cannot be made inactive: move them to another class, or make them inactive, first.</p>
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

  // An inactive class is read, not changed (the server refuses a change).
  if (classItem.status === "inactive") return <InactiveClassView classItem={classItem} />;

  const t = TONES[toneOf(structure, classItem.departmentId)];
  const { sections } = classItem;
  const inSections = sectionSeats(classItem);
  const summary = seatsSummary(classItem, inSections);
  const next = nextSectionName(sections.map((s) => s.name));
  const addSectionButton = (
    <Button type="button" variant="outline" onClick={() => setAddingSection(true)} aria-label={`Add section ${next} to ${classItem.name}`}>
      <Plus className="size-4" aria-hidden />
      Section {next}
    </Button>
  );
  // Inside a department the class is already where it belongs, so there is nothing to choose. Only a class that is in no department
  // (the "Other classes" screen) is offered the school's departments, because giving it one is what that screen is for.
  const unplaced = !classItem.departmentId && structure.departments.length > 0;
  const departmentChips: Chip[] = structure.departments.map((d) => ({ value: d.id, label: d.name, icon: departmentIcon(d.name), tone: toneOf(structure, d.id) }));

  /**
   * The class's part of Save, the name and the seats in one request: what the server refused is returned to show under the box it is
   * about (a name already used, seats below what the sections hold).
   */
  async function saveClass(changes: ClassChanges): Promise<ClassProblems | void> {
    try {
      // `refresh: false`: the one Save asks for the new state once, after all of its changes were sent.
      await updateClass({ id: classId, ...changes, refresh: false }).unwrap();
    } catch (err) {
      const refused = getApiError(err);
      const message = refused?.message ?? "Could not save the class.";
      const aboutSeats =
        refused?.code === "CLASS_SEATS_BELOW_SECTIONS" ||
        (Array.isArray(refused?.details) && (refused.details as { path?: string }[]).some((d) => d.path === "capacity"));
      if (aboutSeats || (changes.name === undefined && changes.capacity !== undefined)) return { capacity: message };
      return { name: message };
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
    void draft.save({ saveClass, saveSection }).then((saved) => {
      // One refresh for the whole Save (the layout, the list's rows and this class), not one for each request it sent.
      if (saved) dispatch(refreshClass());
    });
  }

  return (
    <>
    <form onSubmit={submit} noValidate className="fade-in">
      <div className={cn("bg-gradient-to-r to-transparent px-5 py-5", t.wash)}>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <span aria-hidden className={cn("flex size-14 shrink-0 items-center justify-center rounded-2xl text-xl font-bold", t.gradient)}>
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
          <ClassSeatsField
            name={classItem.name}
            value={draft.classSeats}
            problem={draft.classSeatsProblem}
            dirty={draft.classSeatsDirty}
            unset={classItem.capacity === null}
            onChange={draft.changeClassSeats}
            onRevert={draft.revertClassSeats}
          />
          {/* The class's actions, together and at the right: Save (dimmed until something changes) and, set apart, Make inactive. */}
          <div className="ml-auto flex items-center gap-2">
            <Button type="submit" loading={draft.saving} disabled={!draft.dirty} aria-label="Save changes">
              {!draft.saving && <Save className="size-4" aria-hidden />}
              Save
            </Button>
            <span aria-hidden className="mx-1 h-6 w-px bg-border" />
            <Button
              type="button"
              variant="ghost"
              aria-label={`Make ${classItem.name} inactive`}
              onClick={() => setAsking({ kind: "class", name: classItem.name, sectionCount: sections.length })}
            >
              <Archive className="size-4" aria-hidden />
              Make inactive
            </Button>
          </div>
        </div>

        {summary && <p className={cn("mt-3 text-xs", summary.warn ? "font-semibold text-warning" : "text-foreground-muted")}>{summary.text}</p>}

        {/* Always there for a screen reader, and no height at all until it has something to say (Saved, or what went wrong). */}
        <p aria-live="polite" className={cn("text-xs font-semibold", (draft.summaryProblem || draft.justSaved) && "mt-3")}>
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
          <div className="mt-3">
            <p className={FIELD_TITLE}>Put {classItem.name} in a department</p>
            <ChipPicker label={`Department of ${classItem.name}`} value={pendingDepartment ?? ""} options={departmentChips} onChange={moveTo} />
          </div>
        )}
      </div>

      <div className="space-y-4 px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-section-heading">Sections</h2>
            {/* Sections belong to one session; next year's may differ. */}
            <p className="text-xs text-foreground-muted">
              {sections.length > 0 && plural(sections.length, "section")}
              {sections.length > 0 && structure.academicYear && " · "}
              {structure.academicYear && `for ${structure.academicYear.name}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-1">
              <Switch checked={required} busy={savingSettings} onChange={toggleRequired}>
                Seats and room required
              </Switch>
              <InfoTip label="What does this switch do?">
                On: every section needs its seats and its room. Off: both are optional. It applies to every class in your school.
              </InfoTip>
            </div>
            {/* With no sections the same button is in the middle of the empty box below, where the eye is: not twice. */}
            {next && sections.length > 0 && addSectionButton}
          </div>
        </div>

        {sections.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-background px-4 py-8 text-center">
            <span aria-hidden className="flex size-11 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <Rows3 className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">No sections yet</p>
              <p className="mt-0.5 text-sm text-foreground-muted">Add sections (A, B, C) only if this class is split into groups.</p>
            </div>
            {next && addSectionButton}
          </div>
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
      <AddSectionModal
        classId={classId}
        className={classItem.name}
        suggestedName={next}
        required={required}
        classSeats={classItem.capacity}
        heldBySections={inSections}
        onDivide={(enrolled) => {
          setAddingSection(false);
          setDividing(enrolled);
        }}
        onClose={() => setAddingSection(false)}
      />
    )}
    {dividing !== null && (
      <DivideClassDialog
        classId={classId}
        className={classItem.name}
        enrolled={dividing}
        classSeats={classItem.capacity}
        needsRooms={required}
        onClose={() => setDividing(null)}
      />
    )}
    {questions}
    </>
  );
}
