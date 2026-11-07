import { useEffect, useState } from "react";
import { useBlocker } from "react-router";
import { ArrowDown, ArrowUp, ListPlus, Pencil, Plus } from "lucide-react";
import { MAX_CUSTOM_FIELDS, type CustomFieldDef } from "../../constants/studentFields";
import { useTeacherBase } from "../../hooks/useTeacherBase";
import { useGetTeacherSettingsQuery, useUpdateTeacherSettingsMutation } from "../../redux/api/timetableApi";
import { getApiError } from "../../utils/apiErrors";
import { teacherFieldNamed } from "../../utils/teacherImport";
import { ConfirmModal } from "../../components/classes/ConfirmModal";
import { TEACHER_WORDS } from "../../constants/teachers";
import { CustomFieldDialog } from "../../components/students/export/CustomFieldDialog";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { useResultModal } from "../../components/ui/ResultModal";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";

const MODES = [
  { value: "required", label: "Needed" },
  { value: "optional", label: "Optional" },
  { value: "hidden", label: "Not asked" },
] as const;

const kindOf = (f: CustomFieldDef) => ({ text: "Text", number: "Number", date: "Date", yesNo: "Yes or no", choice: `List of ${f.options.length}` })[f.type];

/**
 * Teacher > Fields (`/teachers/fields`, `/school/teachers/fields`): the school's own fields for its teachers, the ones its Excel files
 * have beyond the usual details (a PAN number, a blood group, house duty...). Each has a name, a kind of answer (fixed once added), the
 * choices of a list, and Needed / Optional / Not asked; they are asked on Add teacher and Change teacher (Needed ones must be answered),
 * read by Bulk upload (a column of a file can be one, or become one), shown on the teacher's page and written in the Export and the
 * sample file. The list is a draft (add, change, delete, reorder) until **Save**, which sends the whole list in one request; **Cancel**
 * puts it back, and leaving with changes not saved asks first.
 */
export default function TeacherFieldsPage() {
  const { base, label } = useTeacherBase();
  const res = useGetTeacherSettingsQuery();
  const [update, { isLoading: saving }] = useUpdateTeacherSettingsMutation();
  const result = useResultModal();
  const saved = res.data?.data.customFields;
  const [draft, setDraft] = useState<CustomFieldDef[] | null>(null);
  const list = draft ?? saved ?? [];
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved ?? []);
  // The window: a field being changed, or a new one (`editing` null).
  const [dialog, setDialog] = useState<{ editing: CustomFieldDef | null } | null>(null);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const change = (next: CustomFieldDef[]) => setDraft(next);
  const replace = (key: string, patch: Partial<CustomFieldDef>) => change(list.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...list];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    change(next);
  };

  async function save() {
    try {
      await update({ customFields: list }).unwrap();
      setDraft(null);
      result.done("Fields saved", "Your teacher fields are saved.");
    } catch (err) {
      result.failed("Fields not saved", getApiError(err)?.message ?? "Could not save the fields. Please try again.");
    }
  }

  const addButton = (
    <Button variant="outline" size="sm" disabled={list.length >= MAX_CUSTOM_FIELDS} onClick={() => setDialog({ editing: null })}>
      <Plus className="size-4" aria-hidden />
      Add a field
    </Button>
  );

  return (
    <div className="space-y-6">
      <StudentFormHeader title="Teacher fields" crumbs={[{ label, to: base }]} current="Fields" />

      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-foreground">
            <ListPlus className="size-5 text-primary" aria-hidden />
            Your own fields
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {list.length > 0 && addButton}
            {dirty && (
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={saving}>
                Cancel
              </Button>
            )}
            <Button size="sm" onClick={() => void save()} disabled={!dirty} loading={saving}>
              Save
            </Button>
          </div>
        </div>

        {res.isLoading ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : res.error && !res.data ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the fields."}</p>
            <Button variant="outline" onClick={() => res.refetch()}>
              Try again
            </Button>
          </div>
        ) : list.length === 0 ? (
          <StudentsNotice icon={ListPlus} tone="primary" title="No fields of your own yet" actions={addButton} />
        ) : (
          <ul aria-label="Your own fields" className="divide-y divide-border/70 rounded-xl border border-border">
            {list.map((f, i) => (
              <li key={f.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate text-sm font-bold text-foreground">{f.label}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge tone="neutral">{kindOf(f)}</Badge>
                    {f.type === "choice" && <span className="truncate text-xs text-foreground-muted">{f.options.join(", ")}</span>}
                  </div>
                </div>
                <div className="w-40">
                  <span id={`mode-${f.key}-label`} className="sr-only">
                    {f.label} asked
                  </span>
                  <Select
                    id={`mode-${f.key}`}
                    value={f.mode}
                    options={MODES.filter((m) => !(f.type === "yesNo" && m.value === "required")).map((m) => ({ value: m.value, label: m.label }))}
                    onChange={(mode) => replace(f.key, { mode: mode as CustomFieldDef["mode"] })}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="px-2" aria-label={`Move ${f.label} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="size-4" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="sm" className="px-2" aria-label={`Move ${f.label} down`} disabled={i === list.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="size-4" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="sm" className="px-2" aria-label={`Change ${f.label}`} onClick={() => setDialog({ editing: f })}>
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {dialog && (
        <CustomFieldDialog
          field={dialog.editing}
          others={list.filter((f) => f.key !== dialog.editing?.key)}
          words={TEACHER_WORDS}
          reserved={teacherFieldNamed}
          onSave={(field) => {
            change(dialog.editing ? list.map((f) => (f.key === dialog.editing!.key ? { ...field, mode: f.mode === "hidden" ? "hidden" : field.mode } : f)) : [...list, field]);
            setDialog(null);
          }}
          onDelete={dialog.editing ? () => {
            change(list.filter((f) => f.key !== dialog.editing!.key));
            setDialog(null);
          } : undefined}
          onClose={() => setDialog(null)}
        />
      )}
      {result.modal}
      {blocker.state === "blocked" && (
        <ConfirmModal title="Leave without saving?" confirmLabel="Leave without saving" onClose={() => blocker.reset()} onConfirm={async () => blocker.proceed()}>
          <p>You have changed your teacher fields and not saved them. If you leave now, the changes are lost.</p>
        </ConfirmModal>
      )}
    </div>
  );
}
