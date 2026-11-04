import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { CircleCheck, LogOut, RotateCcw, Save } from "lucide-react";
import { useFieldsEditor } from "../../hooks/useFieldsEditor";
import { defaultDraft } from "../../utils/exportLayout";
import { cn } from "../../utils/helpers";
import { ExportFieldsCard } from "../../components/students/export/ExportFieldsCard";
import { FieldsGuide } from "../../components/students/export/FieldsGuide";
import { FormFieldsCard } from "../../components/students/export/FormFieldsCard";
import { AskDialog } from "../../components/students/form/AskDialog";
import { FormActionBar } from "../../components/students/form/FormActionBar";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { ModalError } from "../../components/ui/AppModal";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";

/** Where "Manage fields" was opened from (the state the link carries): the page before it is where Back goes. */
export type FieldsFrom = "admit" | "students";

/**
 * Manage school > Students > Manage fields (`/school/students/fields`): the school's fields on a page of their own, for a school that
 * has no student yet (so no Export button) and for anyone in the middle of Add student. Two cards, each the school's to arrange on its
 * own: **Add student form** (the four steps with the boxes the form has; Asked, Mandatory, the step of each detail, the school's own
 * fields, a preview) and **Excel columns** (the Export page's list: in the file or not, heading, place). Mandatory is one setting
 * for both, so a mandatory detail is on the form and in the file. Only the settings are read (no Excel preview). The explanation is
 * behind the (i) beside the title. One Save (a bar pinned to the bottom) sends what changed; Back asks first when something is not
 * saved. Add student and the Excel follow the saved settings from the next student.
 */
export default function ManageFieldsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { push } = useToast();
  const { draft, problems, dirty, isDefault, saving, error, change, saveDraft } = useFieldsEditor();
  // Leaving with changes not saved asks first; `to` is where to go after (nothing: back to where the person came from).
  const [asking, setAsking] = useState<{ to?: string } | "default" | null>(null);
  const [fieldsOpen, setFieldsOpen] = useState(true);

  const from = (location.state as { from?: FieldsFrom } | null)?.from;
  const cameFromHistory = location.key !== "default";
  const go = (to?: string) => (to ? navigate(to) : cameFromHistory ? navigate(-1) : navigate("/school/students"));
  const leave = (to?: string) => (dirty ? setAsking({ to }) : go(to));

  async function save() {
    if ((await saveDraft()) === "saved") push("success", "Saved: Add student and the Excel follow it from now on");
  }

  const crumbs = [{ label: "Students", onClick: () => leave("/school/students") }, ...(from === "admit" ? [{ label: "Add student", onClick: () => leave() }] : [])];

  return (
    <>
      <div className="space-y-5">
        <StudentFormHeader
          title="Manage fields"
          subtitle="Which details Add student asks, and which are mandatory"
          crumbs={crumbs}
          current="Manage fields"
          onBack={() => leave()}
          info={<FieldsGuide />}
        />

        <ModalError message={error} />

        {draft ? (
          <>
            <FormFieldsCard draft={draft} onChange={change} />
            <ExportFieldsCard draft={draft} problems={problems} onChange={change} open={fieldsOpen} onOpenChange={setFieldsOpen} />
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
              // On a phone only the icon and a short word fit; the button is named in full for a screen reader.
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

      {asking && asking !== "default" && (
        <AskDialog title="Leave without saving?" icon={LogOut} confirmLabel="Leave" onClose={() => setAsking(null)} onConfirm={() => go(asking.to)}>
          <p>The changes are not saved. Add student and the Excel stay as they were.</p>
        </AskDialog>
      )}
      {asking === "default" && draft && (
        <AskDialog title="Back to the default?" icon={RotateCcw} confirmLabel="Use the default" onClose={() => setAsking(null)} onConfirm={() => change(defaultDraft(draft.custom))}>
          <p>
            The fields, their headings and their order go back to how a new school starts, and every detail goes back to its usual step; your own fields stay, switched off. Nothing is
            saved until you press Save.
          </p>
        </AskDialog>
      )}
    </>
  );
}
