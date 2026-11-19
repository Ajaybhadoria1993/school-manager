import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { CircleCheck, Download, ListChecks, LogOut, RotateCcw, Save, Users, X } from "lucide-react";
import { useCan } from "../../hooks/useCan";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import { useTeacherBase } from "../../hooks/useTeacherBase";
import { useTeacherExport } from "../../hooks/useTeacherExport";
import { useTeacherFieldsEditor } from "../../hooks/useTeacherFieldsEditor";
import { useGetStructureQuery } from "../../redux/api/academicsApi";
import { useGetSubjectsQuery, useGetTeacherExportPreviewQuery } from "../../redux/api/timetableApi";
import type { TeacherQuery } from "../../types";
import { cn } from "../../utils/helpers";
import { defaultTeacherColumnsDraft, infoOf } from "../../utils/teacherLayout";
import { ExportPreviewCard, type PreviewWords } from "../../components/students/export/ExportPreviewCard";
import { AskDialog } from "../../components/students/form/AskDialog";
import { FormActionBar } from "../../components/students/form/FormActionBar";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { TeacherExcelCard } from "../../components/teachers/fields/TeacherExcelCard";
import { ModalError } from "../../components/ui/AppModal";
import { Button } from "../../components/ui/Button";
import { WithTip } from "../../components/ui/Hint";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";

const TEACHER_PREVIEW_WORDS: PreviewWords = {
  one: "teacher",
  many: "teachers",
  sampleNote: "No teacher is added yet, so the file has this one sample row. It is only for trying the file: it is not saved anywhere.",
};

const OUTLINE =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

const STATUSES = ["active", "inactive", "all"] as const;

/**
 * Teacher > Export (`/teachers/export`, `/school/teachers/export`, with the list's `?q=&subject=&class=&designation=&status=`): the Excel's
 * columns and the file before it is made, the way Students > Export works. The columns are the school's own (in the file or not, heading,
 * place; Mandatory is the same setting as on Add teacher, so a mandatory detail's column cannot be taken out) and are saved only on Save or
 * Export, so every export comes out the same. Under them the preview shows the first teachers in every column; **a school with no teacher yet sees
 * one sample row, and the Export button gives the same file**, so the file can be seen and tried before the first teacher is added. Whoever
 * may export but not change the school's fields sees the preview and the Export button only. Three reads: the settings, the preview, and the
 * subject and class names of the list's filter.
 */
export default function TeacherExportPage() {
  const navigate = useNavigate();
  const { push } = useToast();
  const { base } = useTeacherBase();
  const can = useCan();
  const readOnlyYear = useReadOnlyYear();
  const [params, setParams] = useSearchParams();
  const canChange = can("teachers.settings") && !readOnlyYear;

  const query = useMemo<TeacherQuery>(() => {
    const status = STATUSES.find((s) => s === params.get("status")) ?? "active";
    const q = params.get("q")?.trim() ?? "";
    return {
      status,
      ...(q ? { search: q } : {}),
      ...(params.get("subject") ? { subjectId: params.get("subject")! } : {}),
      ...(params.get("class") ? { classId: params.get("class")! } : {}),
      ...(params.get("designation") ? { designation: params.get("designation")! } : {}),
    };
  }, [params]);

  const previewRes = useGetTeacherExportPreviewQuery(query);
  const subjects = useGetSubjectsQuery("active").data?.data.items ?? [];
  const classes = useGetStructureQuery().data?.data.classes ?? [];
  const { exportTeachers, exporting } = useTeacherExport();
  const { settings, draft, layout, problems, dirty, isDefaultColumns, saving, error, change, saveDraft } = useTeacherFieldsEditor();
  const [ask, setAsk] = useState<"leave" | "default" | null>(null);
  // The columns start closed: the page opens on the preview; they open to be changed.
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

  // The list's own filter, in words (the chip beside the buttons: press it to export everyone instead).
  const who = [
    query.status === "inactive" ? "Teachers who have left" : query.status === "all" ? "Teaching and left" : null,
    query.subjectId ? (subjects.find((s) => s.id === query.subjectId)?.name ?? "One subject") : null,
    query.classId ? (classes.find((c) => c.id === query.classId)?.name ?? "One class") : null,
    query.designation ?? null,
    query.search ? `matching "${query.search}"` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const total = previewRes.data?.data.total;
  const sample = !!previewRes.data?.data.sample;
  const busy = saving || exporting;
  const howMany = total == null ? "Counting the teachers…" : sample ? "No teacher yet · a sample row" : `${total} teacher${total === 1 ? "" : "s"}${who ? "" : " in the school"}`;

  async function onSave() {
    if ((await saveDraft()) === "saved") push("success", "Saved: the Excel follows it from now on");
  }

  /** Saves a change first (the server makes the file from what is saved), then downloads the file. */
  async function onExport() {
    if (dirty && (await saveDraft()) !== "saved") return;
    if (await exportTeachers(query)) push("success", sample ? "The sample file is downloaded" : "The teachers file is downloaded");
  }

  const backTo = query.status === "inactive" && base === "/teachers" ? "/teachers/inactive" : base;
  const back = () => navigate({ pathname: backTo, search: "" });
  const leave = () => (dirty ? setAsk("leave") : back());

  return (
    <>
      <div className="space-y-5">
        <StudentFormHeader
          title="Export teachers"
          subtitle={
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-0.5 text-sm font-semibold text-success">
              <Users className="size-3.5" aria-hidden />
              {howMany}
            </span>
          }
          crumbs={[{ label: base === "/teachers" ? "Teacher" : "Manage Teacher", onClick: leave }]}
          current="Export"
          onBack={leave}
          actions={
            <>
              {canChange && (
                <Link to={`${base}/fields`} className={OUTLINE}>
                  <ListChecks className="size-4" aria-hidden />
                  Manage fields
                </Link>
              )}
              {who && (
                <WithTip tip="Only these teachers are exported. Press to export everyone instead.">
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
              {canChange && !isDefaultColumns && (
                <WithTip tip="The columns, headings and order a new school's Excel starts with. What Add teacher asks is not changed. Nothing is saved until you press Save.">
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

        {canChange && <TeacherExcelCard draft={draft} problems={problems} onChange={change} open={fieldsOpen} onOpenChange={setFieldsOpen} />}

        <ExportPreviewCard
          layout={layout}
          custom={draft.custom}
          preview={previewRes.data?.data}
          loading={previewRes.isFetching}
          uploadNote={null}
          words={TEACHER_PREVIEW_WORDS}
          headingOf={(key) => infoOf(key, draft.custom).heading}
        />

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
            {canChange && (
              <Button variant="outline" size="lg" loading={saving && !exporting} disabled={!dirty || busy} onClick={() => void onSave()}>
                {!(saving && !exporting) && <Save className="size-4" aria-hidden />}
                Save
              </Button>
            )}
            <Button size="lg" loading={exporting} disabled={busy || (total === 0 && !sample)} onClick={() => void onExport()}>
              {!exporting && <Download className="size-4" aria-hidden />}
              {sample ? "Download sample" : "Export"}
            </Button>
          </div>
        </FormActionBar>
      </div>

      {ask === "leave" && (
        <AskDialog title="Leave without saving?" icon={LogOut} confirmLabel="Leave" onClose={() => setAsk(null)} onConfirm={back}>
          <p>The changes are not saved. Add teacher and the next export stay as they were.</p>
        </AskDialog>
      )}
      {ask === "default" && (
        <AskDialog title="Back to the default?" icon={RotateCcw} confirmLabel="Use the default" onClose={() => setAsk(null)} onConfirm={() => change(defaultTeacherColumnsDraft(draft))}>
          <p>
            The Excel's columns, their headings and their order go back to how a new school starts (the columns of mandatory details stay). What Add teacher asks is not changed. Nothing is saved until you press Save.
          </p>
        </AskDialog>
      )}
    </>
  );
}
