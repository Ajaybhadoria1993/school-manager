import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { CircleCheck, Download, LogOut, RotateCcw, Save, Users, X } from "lucide-react";
import type { FieldRules, FormFieldKey } from "../../constants/studentFields";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useDownloadSheetMutation, useGetExportPreviewQuery, useGetStudentSettingsQuery, useUpdateStudentSettingsMutation } from "../../redux/api/studentsApi";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import {
  defaultDraft,
  draftOf,
  isDefaultLayout,
  layoutOf,
  layoutProblems,
  missingForUpload,
  sameDraft,
  tidyHeading,
  type FieldsDraft,
} from "../../utils/exportLayout";
import type { ExportColumn } from "../../types";
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

const sameLayout = (a: ExportColumn[], b: ExportColumn[]) => JSON.stringify(a.map((c) => [c.key, tidyHeading(c.heading)])) === JSON.stringify(b.map((c) => [c.key, tidyHeading(c.heading)]));
const changedRules = (a: FieldRules, b: FieldRules) => (Object.keys(a) as FormFieldKey[]).filter((k) => a[k] !== b[k]);

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

  const settingsRes = useGetStudentSettingsQuery();
  const previewRes = useGetExportPreviewQuery(filters);
  const structure = useGetStructureQuery().data?.data;
  const [save, { isLoading: saving }] = useUpdateStudentSettingsMutation();
  const [download, { isLoading: downloading }] = useDownloadSheetMutation();

  const settings = settingsRes.data?.data;
  // What is saved, as the list shows it (a field that is off is not asked; one that is on is asked).
  const base = useMemo<FieldsDraft | null>(() => (settings ? draftOf(settings) : null), [settings]);
  const [edited, setEdited] = useState<FieldsDraft | null>(null);
  const [serverProblems, setServerProblems] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<"leave" | "default" | null>(null);
  // The fields start closed: the page opens on the preview; they open to be changed.
  const [fieldsOpen, setFieldsOpen] = useState(false);

  const draft = edited ?? base;
  const layout = useMemo(() => (draft ? layoutOf(draft) : []), [draft]);
  // The heading problems by the field's key (the list shows the field where it stands).
  const problems = useMemo(() => {
    const byPlace = layoutProblems(layout);
    return { ...Object.fromEntries(Object.entries(byPlace).map(([i, message]) => [layout[Number(i)].key, message])), ...serverProblems };
  }, [layout, serverProblems]);
  const dirty = !!draft && !!base && !sameDraft(draft, base);

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
  const isDefault = sameDraft(draft, defaultDraft(draft.custom));

  const change = (next: FieldsDraft) => {
    setEdited(next);
    setServerProblems({});
    setError(null);
  };

  /** Saves what changed (a default layout is saved as "no layout of our own"); false when a heading needs a fix or the server said no. */
  async function saveDraft(): Promise<boolean> {
    if (!draft || !settings) return false;
    if (Object.keys(problems).length > 0) {
      setError("Fix the headings marked in red first.");
      // The headings are in the fields: they open to show which one.
      setFieldsOpen(true);
      return false;
    }
    const rules = changedRules(draft.rules, settings.fields);
    const customChanged = JSON.stringify(draft.custom) !== JSON.stringify(settings.customFields);
    const layoutChanged = !sameLayout(layout, settings.exportColumns) || settings.exportIsDefault !== isDefaultLayout(layout);
    setError(null);
    try {
      await save({
        ...(rules.length > 0 ? { fields: Object.fromEntries(rules.map((k) => [k, draft.rules[k]])) } : {}),
        ...(customChanged ? { customFields: draft.custom } : {}),
        ...(layoutChanged ? { exportColumns: isDefaultLayout(layout) ? null : layout.map((c) => ({ key: c.key, heading: tidyHeading(c.heading) })) } : {}),
      }).unwrap();
      // The page keeps its list as it is (a field switched off stays where it was); it now equals what is saved, so nothing is "not
      // saved". Opened again, the page lists the fields that are off after the ones that are on.
      return true;
    } catch (err) {
      const apiError = getApiError(err);
      const byKey: Record<string, string> = {};
      for (const d of (apiError?.details as { path?: string; message?: string }[] | undefined) ?? []) {
        const place = /^exportColumns\.(\d+)/.exec(d.path ?? "");
        if (place && d.message && layout[Number(place[1])]) byKey[layout[Number(place[1])].key] = d.message;
      }
      setServerProblems(byKey);
      if (Object.keys(byKey).length > 0) setFieldsOpen(true);
      const first = (apiError?.details as { message?: string }[] | undefined)?.[0]?.message;
      setError(first ? `${apiError?.message ?? "Could not save"}: ${first}` : (apiError?.message ?? "Could not save. Please try again."));
      return false;
    }
  }

  async function onSave() {
    if (await saveDraft()) push("success", "Saved: Add student and the Excel follow it from now on");
  }

  /** Saves a change first (the server makes the file from what is saved), then downloads the file. */
  async function onExport() {
    if (dirty && !(await saveDraft())) return;
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
