import { useCallback, useEffect, useState } from "react";
import { Armchair, DoorOpen, RotateCcw, Save } from "lucide-react";
import { useStudentForm } from "../../../hooks/useStudentForm";
import { useAppDispatch } from "../../../redux/hooks";
import {
  refreshAfterSave,
  studentsApi,
  useMoveStudentMutation,
  useUpdateGuardianMutation,
  useUpdateStudentMutation,
} from "../../../redux/api/studentsApi";
import { getApiError } from "../../../utils/apiErrors";
import { formFromStudent, guardianChanges, placementChanges, profileChanges } from "../../../utils/students";
import type { AcademicStructure, GuardianMatch, SectionItem, SectionLoad, StudentCapacity, StudentDetail } from "../../../types";
import { ModalError } from "../../ui/AppModal";
import { Button } from "../../ui/Button";
import { useToast } from "../../ui/toast-context";
import { AddressFields } from "../form/AddressFields";
import { AskDialog } from "../form/AskDialog";
import { CustomFields } from "../form/CustomFields";
import { FormActionBar } from "../form/FormActionBar";
import { GuardiansCard } from "../form/GuardiansCard";
import { MoreFields } from "../form/MoreFields";
import { PlacementFields } from "../form/PlacementFields";
import { IdFields, PreviousSchoolFields } from "../form/RecordsFields";
import type { CustomFieldDef, FieldRules } from "../../../constants/studentFields";
import { StudentFields } from "../form/StudentFields";
import { StudentFormHeader } from "../StudentFormHeader";
import { EditSidebar } from "./EditSidebar";

const PROFILE_PATHS = ["firstName", "lastName", "gender", "dateOfBirth", "admissionDate", "address", "bloodGroup", "category", "previousSchool"];
const PLACEMENT_PATHS = ["classId", "sectionId", "rollNumber"];

type ServerDetail = { path: string; message: string };

/**
 * A student's page while it is being changed, laid out like the admission page (and like an edit-patient page of a clinic app): a plain
 * header with Back, the same boxes as cards on the left, filled with what is saved, the student as saved and a few tips on the right,
 * and a bar pinned to the bottom with ONE Save changes (dimmed until something differs) and Undo changes. Back asks before it throws
 * typed changes away. Nothing is sent while typing. Save sends, one after another and each with only
 * what changed: every changed guardian (PATCH /students/guardians/:id), the student's own details (PATCH /students/:id), and their
 * class, section or roll number (PATCH /students/:id/enrolment). The page on screen takes the server's answers (nothing is read
 * again); the list and the other students' pages that show this one are marked stale once, at the end. What the server refuses stays
 * typed, with its message under the box; what was saved is not sent again.
 */
export function EditStudentForm({
  student,
  structure,
  capacity,
  rules,
  custom,
  onDone,
}: {
  student: StudentDetail;
  structure: AcademicStructure;
  capacity: StudentCapacity | undefined;
  /** What this school needs: which boxes show, as needed or optional (a needed one that is saved cannot be emptied). */
  rules: FieldRules;
  /** The school's own fields (a field that is not asked any more still shows when this student has an answer for it). */
  custom: CustomFieldDef[];
  onDone: () => void;
}) {
  const { push } = useToast();
  const dispatch = useAppDispatch();
  const [updateStudent] = useUpdateStudentMutation();
  const [moveStudent] = useMoveStudentMutation();
  const [updateGuardian] = useUpdateGuardianMutation();
  const [initial] = useState(() => formFromStudent(student));
  const classHasSections = useCallback((id: string) => !!structure.classes.find((c) => c.id === id)?.sections.length, [structure]);
  // A field of the school's own that is off is still shown (and can be changed or cleared) while this student has an answer for it.
  const [ownFields] = useState(() => custom.map((f) => (f.mode === "hidden" && student.custom?.[f.key] !== undefined ? { ...f, mode: "optional" as const } : f)));
  const form = useStudentForm(initial, { mode: "edit", classHasSections, rules, custom: ownFields });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [overCapacityFor, setOverCapacityFor] = useState<string | null>(null);

  // The student's page turns into this form in the same place: start at its top, not wherever the page had been scrolled to.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);
  const [ask, setAsk] = useState<
    { kind: "full-pick"; section: SectionItem; load: SectionLoad } | { kind: "full"; message: string } | { kind: "undo" } | { kind: "leave" } | null
  >(null);

  /** Back: straight away when nothing was typed, else after asking (typed changes would be lost). */
  const goBack = () => (form.dirty ? setAsk({ kind: "leave" }) : onDone());
  /** Undo changes: every box goes back to what is saved (what an earlier part of this Save already stored counts as saved). */
  function undoChanges() {
    form.reset(form.saved);
    setOverCapacityFor(null);
    setFormError(null);
  }

  async function save(allowOverCapacity: boolean) {
    setFormError(null);
    if (!form.check()) {
      setFormError("Some boxes need a change: see the messages in red.");
      return;
    }
    const v = form.values;
    const saved = form.saved;
    const guardianEdits = v.guardians
      .map((g, i) => ({ g, i, changes: guardianChanges(g, saved.guardians[i]) }))
      .filter((edit) => Object.keys(edit.changes).length > 0);
    const profile = profileChanges(v, saved, ownFields.filter((f) => f.mode !== "hidden"));
    const placement = placementChanges(v, saved, allowOverCapacity);
    if (guardianEdits.length === 0 && Object.keys(profile).length === 0 && !placement) return;

    setSaving(true);
    const refused: ServerDetail[] = [];
    const messages: string[] = [];
    const keep = (err: unknown, at: (path: string) => string) => {
      const error = getApiError(err);
      const details = Array.isArray(error?.details) ? (error.details as ServerDetail[]) : [];
      if (details.length > 0) refused.push(...details.map((d) => ({ path: at(d.path), message: d.message })));
      else messages.push(error?.message ?? "Could not save a change.");
    };
    // Other students whose page shows this one or one of these parents: marked stale once, at the end.
    const others = new Set(student.siblings.map((s) => s.id));
    const savedGuardians: (GuardianMatch & { mobileChanged: boolean })[] = [];
    let answered = false;
    let full: string | null = null;

    for (const { g, i, changes } of guardianEdits) {
      try {
        const res = await updateGuardian({ id: g.id!, ...changes, refresh: false }).unwrap();
        savedGuardians.push({ ...res.data, mobileChanged: changes.mobile !== undefined });
        for (const child of res.data.children) if (child.id !== student.id) others.add(child.id);
        form.rebase([`guardians.${i}`]);
      } catch (err) {
        keep(err, (path) => `guardians.${i}.${path}`);
      }
    }
    if (Object.keys(profile).length > 0) {
      try {
        await updateStudent({ id: student.id, ...profile, refresh: false }).unwrap();
        answered = true;
        form.rebase(PROFILE_PATHS);
      } catch (err) {
        keep(err, (path) => path);
      }
    }
    if (placement) {
      try {
        await moveStudent({ id: student.id, ...placement, refresh: false }).unwrap();
        answered = true;
        form.rebase(PLACEMENT_PATHS);
      } catch (err) {
        const error = getApiError(err);
        if (error?.code === "SECTION_FULL") full = error.message;
        else keep(err, (path) => path);
      }
    }

    // The page on screen: a student's answer is already in its cache (each change writes it there). Only parents changed: their new
    // details are written into it here, so it is not read again either.
    if (!answered && savedGuardians.length > 0) {
      dispatch(
        studentsApi.util.updateQueryData("getStudent", student.id, (draft) => {
          for (const g of savedGuardians) {
            const own = draft.data.guardians.find((x) => x.id === g.id);
            if (!own) continue;
            Object.assign(own, { name: g.name, mobile: g.mobile, alternateMobile: g.alternateMobile, email: g.email, occupation: g.occupation });
            if (g.mobileChanged) own.mobileVerified = false;
          }
        })
      );
    }
    if (savedGuardians.length > 0 || answered) dispatch(refreshAfterSave({ studentIds: [...others] }));
    setSaving(false);

    if (full) {
      setAsk({ kind: "full", message: full });
    } else if (refused.length > 0 || messages.length > 0) {
      form.showServerErrors(refused);
      setFormError(messages[0] ?? "Some changes could not be saved: see the messages in red. The others are saved.");
    } else {
      push("success", `${student.name}'s details saved`);
      onDone();
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!saving) void save(!!form.values.sectionId && overCapacityFor === form.values.sectionId);
  }

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-6">
        <StudentFormHeader
          title="Edit student"
          subtitle={`${student.name} · ${student.admissionNumber}`}
          crumbs={[{ label: "Students", to: "/school/students" }, { label: student.name, onClick: goBack }]}
          current="Edit"
          onBack={goBack}
        />

        {formError && <ModalError message={formError} />}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-6">
            <StudentFields form={form} mode="edit" index={0} />
            <PlacementFields
              form={form}
              structure={structure}
              capacity={capacity}
              ownSectionId={student.place?.sectionId ?? null}
              index={1}
              onPickFull={(section, load) => setAsk({ kind: "full-pick", section, load })}
            />
            <GuardiansCard form={form} mode="edit" index={2} />
            <AddressFields form={form} index={3} />
            <IdFields form={form} index={4} />
            <PreviousSchoolFields form={form} index={5} />
            <MoreFields form={form} startOpen={false} index={6} />
            <CustomFields form={form} index={7} />
          </div>
          <EditSidebar student={student} />
        </div>

        <FormActionBar>
          <Button type="button" variant="ghost" className="text-foreground-muted hover:text-danger" disabled={!form.dirty || saving} onClick={() => setAsk({ kind: "undo" })}>
            <RotateCcw className="size-4" aria-hidden />
            Undo changes
          </Button>
          <div className="flex items-center gap-3">
            <p className="hidden text-xs text-foreground-muted md:block">Enter in any box also saves. Escape puts a box back.</p>
            <Button type="submit" size="lg" loading={saving} disabled={!form.dirty} aria-label="Save changes">
              {!saving && <Save className="size-4" aria-hidden />}
              Save changes
            </Button>
          </div>
        </FormActionBar>
      </form>

      {ask?.kind === "undo" && (
        <AskDialog title="Undo your changes?" icon={RotateCcw} confirmLabel="Undo changes" onClose={() => setAsk(null)} onConfirm={undoChanges}>
          <p>Every box goes back to what is saved. Nothing in your school changes.</p>
        </AskDialog>
      )}
      {ask?.kind === "leave" && (
        <AskDialog title="Leave without saving?" icon={DoorOpen} confirmLabel="Leave" onClose={() => setAsk(null)} onConfirm={onDone}>
          <p>You typed changes that are not saved. If you leave now they are thrown away.</p>
        </AskDialog>
      )}
      {ask?.kind === "full-pick" && (
        <AskDialog
          title={`Section ${ask.section.name} is full`}
          icon={Armchair}
          confirmLabel="Move the student here anyway"
          onClose={() => setAsk(null)}
          onConfirm={() => {
            setOverCapacityFor(ask.section.id);
            form.set("sectionId", ask.section.id);
          }}
        >
          <p>
            {ask.load.enrolled} of {ask.load.capacity} seats are taken. The student can still move here; the section will have more students than
            its seats.
          </p>
        </AskDialog>
      )}
      {ask?.kind === "full" && (
        <AskDialog
          title="This section is full"
          icon={Armchair}
          confirmLabel="Move anyway"
          onClose={() => setAsk(null)}
          onConfirm={() => {
            setOverCapacityFor(form.values.sectionId);
            void save(true);
          }}
        >
          <p>{ask.message}</p>
          <p>The other changes are saved. Move the student anyway, or cancel and pick another section.</p>
        </AskDialog>
      )}
    </>
  );
}
