import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { CircleCheck, Download, LogOut, RotateCcw, Save, Users, X } from "lucide-react";
import { useFieldsEditor } from "../../hooks/useFieldsEditor";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useDownloadSheetMutation, useGetExportPreviewQuery } from "../../redux/api/studentsApi";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import { defaultDraft, missingForUpload } from "../../utils/exportLayout";
import { ExportFieldsCard } from "../../components/students/export/ExportFieldsCard";
import { ExportPreviewCard } from "../../components/students/export/ExportPreviewCard";
import { AskDialog } from "../../components/students/form/AskDialog";
import { FormActionBar } from "../../components/students/form/FormActionBar";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { ModalError } from "../../components/ui/AppModal";
import { Button } from "../../components/ui/Button";
import { WithTip } from "../../components/ui/Hint";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";

/**
 * Manage school > Students > Export (`/school/students/export`, with the list's `?q=&class=&section=`): the school's fields, one list
 * for the Add student form and the Excel. A field that is on is asked on Add student and is a column of the file; Mandatory says Add
 * student is not saved without it; ↑ ↓ or a drag set its place in the file, and its heading can be typed over. The school adds fields of
 * its own here. The preview below shows the file before it is made. Saved for the school (one PUT, only on Save or Export), so every
 * export comes out the same. Three reads: the settings, the first students with every column's value (changing the list asks for
 * nothing), and the class names (the list's).
 */
export default function StudentExportPage() {
  const navigate = useNavigate();
  const { push } = useToast();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => {
    const q = params.get("q")?.trim() ?? "";
    const classId = params.get("class") ?? "";
    const sectionId = classId ? (params.get("section") ?? "") : "";
    return { ...(q ? { q } : {}), ...(classId ? { classId } : {}), ...(sectionId ? { sectionId } : {}) };
  }, [params]);

  const previewRes = useGetExportPreviewQuery(filters);
  const structure = useGetStructureQuery().data?.data;
  const [download, { isLoading: downloading }] = useDownloadSheetMutation();
  // The school's fields: what is saved, the changes not saved yet, and the one save (shared with the dialog on Add student).
  const { settings, draft, layout, problems, dirty, isDefault, saving, error, setError, change, saveDraft } = useFieldsEditor();
  const [ask, setAsk] = useState<"leave" | "default" | null>(null);
  // The fields start closed: the page opens on the preview; they open to be changed.
  const [fieldsOpen, setFieldsOpen] = useState(false);

  if (!draft || !settings) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-14 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }

  const klass = filters.classId ? structure?.classes.find((c) => c.id === filters.classId) : undefined;
  const section = filters.sectionId ? klass?.sections.find((s) => s.id === filters.sectionId) : undefined;
  const who = [klass ? (section ? `${klass.name} · ${section.name}` : klass.name) : filters.classId ? "One class" : null, filters.q ? `matching "${filters.q}"` : null]
    .filter(Boolean)
    .join(", ");
  const total = previewRes.data?.data.total;
  const busy = saving || downloading;
  const forUpload = missingForUpload(layout);
  const uploadNote =
    forUpload.length > 0
      ? `To upload this Excel back later through Bulk upload, turn on: ${forUpload.join(", ")}${forUpload.includes("Date of Birth") && layout.some((c) => c.key === "age") ? " (Age is not enough)" : ""}.`
      : null;
  const exportLabel = "Export";
  // How many students the file will have, at the top (the filter of the list, when there is one, is the chip beside it).
  const howMany = total == null ? "Counting the students…" : `${total} student${total === 1 ? "" : "s"}${who ? "" : " this year"}`;

  /** Saves the list; a heading that needs a fix opens the fields, to show which one. True when it was saved. */
  async function save(): Promise<boolean> {
    const result = await saveDraft();
    if (result === "headings") setFieldsOpen(true);
    return result === "saved";
  }

  async function onSave() {
    if (await save()) push("success", "Saved: Add student and the Excel follow it from now on");
  }

  /** Saves a change first (the server makes the file from what is saved), then downloads the file. */
  async function onExport() {
    if (dirty && !(await save())) return;
    const query = Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as Record<string, string>;
    try {
      await download({ url: "/students/export", params: query, fallbackName: "students.xlsx" }).unwrap();
      push("success", "The students file is downloaded");
    } catch (err) {
      setError(getApiError(err)?.message ?? "Could not download the students.");
    }
  }

  const back = () => navigate({ pathname: "/school/students", search: params.toString() });
  const leave = () => (dirty ? setAsk("leave") : back());

  return (
    <>
      <div className="space-y-5">
        <StudentFormHeader
          title="Export students"
          subtitle={
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-0.5 text-sm font-semibold text-success">
              <Users className="size-3.5" aria-hidden />
              {howMany}
            </span>
          }
          crumbs={[{ label: "Students", onClick: leave }]}
          current="Export"
          onBack={leave}
          actions={
            <>
              {who && (
                <WithTip tip="Only these students are exported. Press to export everyone of this year instead.">
                  <button
                    type="button"
                    onClick={() => setParams({}, { replace: true })}
                    className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg bg-primary-soft px-3 text-sm font-semibold text-primary-deep hover:bg-[#dbe7ff]"
                  >
                    {who}
                    <X className="size-4" aria-label="Everyone instead" />
                  </button>
                </WithTip>
              )}
              {!isDefault && (
                <WithTip tip="The fields, headings and order a new school starts with (your own fields stay, switched off). Nothing is saved until you press Save.">
                  <Button variant="outline" onClick={() => setAsk("default")}>
                    <RotateCcw className="size-4" aria-hidden />
                    Back to the default
                  </Button>
                </WithTip>
              )}
            </>
          }
        />

        {error && <ModalError message={error} />}

        <ExportFieldsCard draft={draft} problems={problems} onChange={change} open={fieldsOpen} onOpenChange={setFieldsOpen} />

        <ExportPreviewCard layout={layout} custom={draft.custom} preview={previewRes.data?.data} loading={previewRes.isFetching} uploadNote={uploadNote} />

        <FormActionBar>
          <p className={cn("flex items-center gap-1.5 text-sm", dirty ? "font-semibold text-warning" : "text-foreground-muted")}>
            {dirty ? (
              "Changes not saved yet"
            ) : (
              <>
                <CircleCheck className="size-4 text-success" aria-hidden />
                All saved
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="lg" loading={saving && !downloading} disabled={!dirty || busy} onClick={() => void onSave()}>
              {!(saving && !downloading) && <Save className="size-4" aria-hidden />}
              Save
            </Button>
            <Button size="lg" loading={downloading} disabled={busy || total === 0} onClick={() => void onExport()}>
              {!downloading && <Download className="size-4" aria-hidden />}
              {exportLabel}
            </Button>
          </div>
        </FormActionBar>
      </div>

      {ask === "leave" && (
        <AskDialog title="Leave without saving?" icon={LogOut} confirmLabel="Leave" onClose={() => setAsk(null)} onConfirm={back}>
          <p>The changes are not saved. Add student and the next export stay as they were.</p>
        </AskDialog>
      )}
      {ask === "default" && (
        <AskDialog title="Back to the default?" icon={RotateCcw} confirmLabel="Use the default" onClose={() => setAsk(null)} onConfirm={() => change(defaultDraft(draft.custom))}>
          <p>The fields, their headings and their order go back to how a new school starts; your own fields stay, switched off. Nothing is saved until you press Save.</p>
        </AskDialog>
      )}
    </>
  );
}
