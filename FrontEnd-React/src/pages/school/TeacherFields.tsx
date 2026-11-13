import { useEffect, useState } from "react";
import { useBlocker } from "react-router";
import { CircleCheck, RotateCcw, Save } from "lucide-react";
import { TEACHER_WORDS } from "../../constants/teachers";
import { useTeacherBase } from "../../hooks/useTeacherBase";
import { useTeacherFieldsEditor } from "../../hooks/useTeacherFieldsEditor";
import { teacherFieldNamed } from "../../utils/teacherImport";
import { addTeacherCustom, defaultTeacherDraft, editTeacherCustom, removeTeacherCustom } from "../../utils/teacherLayout";
import { cn } from "../../utils/helpers";
import type { CustomFieldDef } from "../../constants/studentFields";
import { ConfirmModal } from "../../components/classes/ConfirmModal";
import { CustomFieldDialog } from "../../components/students/export/CustomFieldDialog";
import { AskDialog } from "../../components/students/form/AskDialog";
import { FormActionBar } from "../../components/students/form/FormActionBar";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { TeacherExcelCard } from "../../components/teachers/fields/TeacherExcelCard";
import { TeacherFormCard } from "../../components/teachers/fields/TeacherFormCard";
import { ModalError } from "../../components/ui/AppModal";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";

/**
 * Teacher > Manage fields (`/teachers/fields`, `/school/teachers/fields`): the school's fields for its teachers on a page of their own, the way
 * Students > Manage fields works. Two cards, each the school's to arrange on its own: **Add teacher form** (every usual detail Asked and
 * Mandatory, the school's own fields) and **Excel columns** (the Export page's list: in the file or not, heading, place). Mandatory is one
 * setting for both, so a mandatory detail is on the form and in the file; Bulk upload and the sample file follow what is needed. One Save (a bar
 * at the bottom) sends what changed; leaving with changes not saved asks first.
 */
export default function TeacherFieldsPage() {
  const { base, label } = useTeacherBase();
  const { push } = useToast();
  const { draft, problems, dirty, isDefault, saving, error, change, saveDraft } = useTeacherFieldsEditor();
  // The window: a field being changed, or a new one (`editing` null).
  const [dialog, setDialog] = useState<{ editing: CustomFieldDef | null } | null>(null);
  const [asking, setAsking] = useState<"default" | null>(null);
  const [fieldsOpen, setFieldsOpen] = useState(true);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save() {
    if ((await saveDraft()) === "saved") push("success", "Saved: Add teacher and the Excel follow it from now on");
  }

  return (
    <>
      <div className="space-y-5">
        <StudentFormHeader title="Manage fields" subtitle="Which details Add teacher asks, and which are mandatory" crumbs={[{ label, to: base }]} current="Manage fields" />

        <ModalError message={error} />

        {draft ? (
          <>
            <TeacherFormCard draft={draft} onChange={change} onAdd={() => setDialog({ editing: null })} onEdit={(field) => setDialog({ editing: field })} />
            <TeacherExcelCard draft={draft} problems={problems} onChange={change} open={fieldsOpen} onOpenChange={setFieldsOpen} />
          </>
        ) : (
          <div aria-busy="true" className="space-y-2">
            <Skeleton className="h-14 rounded-2xl" />
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        )}

        <FormActionBar>
          <p className={cn("flex items-center gap-1.5 text-sm", dirty ? "font-semibold text-warning" : "text-foreground-muted")}>
            {dirty ? (
              <>
                <span className="sm:hidden">Not saved</span>
                <span className="hidden sm:inline">Changes not saved yet</span>
              </>
            ) : (
              <>
                <CircleCheck className="size-4 text-success" aria-hidden />
                All saved
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            {draft && !isDefault && (
              <Button variant="ghost" aria-label="Back to the default" className="whitespace-nowrap px-3 sm:px-4" disabled={saving} onClick={() => setAsking("default")}>
                <RotateCcw className="size-4" aria-hidden />
                <span className="sm:hidden">Default</span>
                <span className="hidden sm:inline">Back to the default</span>
              </Button>
            )}
            <Button size="lg" loading={saving} disabled={!dirty || saving} onClick={() => void save()}>
              {!saving && <Save className="size-4" aria-hidden />}
              Save
            </Button>
          </div>
        </FormActionBar>
      </div>

      {dialog && draft && (
        <CustomFieldDialog
          field={dialog.editing}
          others={draft.custom.filter((f) => f.key !== dialog.editing?.key)}
          words={TEACHER_WORDS}
          reserved={teacherFieldNamed}
          onSave={(field) => {
            change(dialog.editing ? editTeacherCustom(draft, field) : addTeacherCustom(draft, field));
            setDialog(null);
          }}
          onDelete={
            dialog.editing
              ? () => {
                  change(removeTeacherCustom(draft, dialog.editing!.key));
                  setDialog(null);
                }
              : undefined
          }
          onClose={() => setDialog(null)}
        />
      )}
      {asking === "default" && draft && (
        <AskDialog title="Back to the default?" icon={RotateCcw} confirmLabel="Use the default" onClose={() => setAsking(null)} onConfirm={() => change(defaultTeacherDraft(draft.custom))}>
          <p>
            The details, their headings and the Excel's columns go back to how a new school starts: every detail optional, the usual columns. Your own fields stay, switched off. Nothing is saved until you press Save.
          </p>
        </AskDialog>
      )}
      {blocker.state === "blocked" && (
        <ConfirmModal title="Leave without saving?" confirmLabel="Leave without saving" onClose={() => blocker.reset()} onConfirm={async () => blocker.proceed()}>
          <p>You have changed your teacher fields and not saved them. If you leave now, the changes are lost.</p>
        </ConfirmModal>
      )}
    </>
  );
}
