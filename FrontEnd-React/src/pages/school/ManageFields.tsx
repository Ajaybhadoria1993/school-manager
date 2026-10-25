import { useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { CircleCheck, LogOut, RotateCcw, Save } from "lucide-react";
import { useFieldsEditor } from "../../hooks/useFieldsEditor";
import { defaultDraft } from "../../utils/exportLayout";
import { cn } from "../../utils/helpers";
import { ExportFieldsCard } from "../../components/students/export/ExportFieldsCard";
import { AskDialog } from "../../components/students/form/AskDialog";
import { FormActionBar } from "../../components/students/form/FormActionBar";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { ModalError } from "../../components/ui/AppModal";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";

/** Where "Manage fields" was opened from (the state the link carries): the page before it is where Back goes. */
export type FieldsFrom = "admit" | "students";

/**
 * Manage school > Students > Manage fields (`/school/students/fields`): the school's fields on a page of their own, for a school that
 * has no student yet (so no Export button) and for anyone in the middle of Add student: which details Add student asks, which are
 * mandatory, and the Excel's columns. It is the Export page's list (the same component and the same save), without the Excel's
 * preview, so only the settings are read. One Save (a bar pinned to the bottom) sends what changed; Back asks first when something is
 * not saved. Add student and the Excel follow the saved list from the next student.
 */
export default function ManageFieldsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { push } = useToast();
  const { draft, problems, dirty, isDefault, saving, error, change, saveDraft } = useFieldsEditor();
  // Leaving with changes not saved asks first; `to` is where to go after (nothing: back to where the person came from).
  const [asking, setAsking] = useState<{ to?: string } | "default" | null>(null);

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
        />

        <Card className="space-y-2 p-4 text-sm text-foreground-muted sm:px-5">
          <p>One list for Add student and the Excel.</p>
          <p>
            <strong className="text-foreground">Every school keeps these</strong>, always on, in Add student and in the Excel: Student Name, Gender, Date of Birth, Age, Category,
            Class and Section, both parents' names and mobile numbers, the Address (always needed) and the Previous School (needed from Class 1; Nursery, LKG and UKG
            may leave it empty). Section is asked when the class has sections, and can be changed later on the student's page.
          </p>
          <p>
            <strong className="text-foreground">Bulk upload is flexible</strong>: an old register seldom holds all of this, so a file is accepted without the rest. Only the name,
            gender, date of birth, class and a parent's mobile number are needed there. Add student is the strict one.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong className="text-foreground">On</strong>: Add student asks it, and it is a column of the Excel.
            </li>
            <li>
              <strong className="text-foreground">Mandatory</strong>: a student is not saved without it. <strong className="text-foreground">Optional</strong>: it may be left empty.
            </li>
            <li>
              <strong className="text-foreground">Always</strong>: Add student always asks it, whatever you choose here (the first name, the last name, the date of birth...).
              Turning it On only makes it a column of the Excel.
            </li>
            <li>
              <strong className="text-foreground">Student Name</strong> is only the full name in one column of the Excel, made from the first and the last name.
            </li>
          </ul>
        </Card>

        <ModalError message={error} />

        {draft ? (
          <ExportFieldsCard draft={draft} problems={problems} onChange={change} open onOpenChange={() => {}} collapsible={false} />
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
          <p>The fields, their headings and their order go back to how a new school starts; your own fields stay, switched off. Nothing is saved until you press Save.</p>
        </AskDialog>
      )}
    </>
  );
}
