import { useState } from "react";
import { Archive, BookOpen, Check, Pencil, Plus, RotateCcw } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { SUBJECT_PRESETS } from "../../constants/timetable";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import { useCreateSubjectMutation, useGetSubjectsQuery, useQuickAddSubjectsMutation, useUpdateSubjectMutation } from "../../redux/api/timetableApi";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import type { Subject, SubjectCategory } from "../../types";
import { ConfirmModal } from "../../components/classes/ConfirmModal";
import { useSave } from "../../components/classes/useSave";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { AppModal, ModalError } from "../../components/ui/AppModal";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";

const KINDS = [
  { value: "academic", label: "Subject with marks" },
  { value: "activity", label: "Activity, no marks (PT, Art, Library)" },
];
const kindLabel = (c: SubjectCategory) => (c === "academic" ? "With marks" : "Activity");
const keyOf = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

/** What the server said about one box of a form (`details` are { path, message }). */
function fieldErrors(error: { details?: unknown } | null | undefined): Record<string, string> {
  const details = Array.isArray(error?.details) ? (error.details as { path?: string; message?: string }[]) : [];
  return Object.fromEntries(details.filter((d) => d.path && d.message).map((d) => [d.path!, d.message!]));
}

function SubjectDialog({ subject, onClose }: { subject: Subject; onClose: () => void }) {
  const [update] = useUpdateSubjectMutation();
  const { push } = useToast();
  const [name, setName] = useState(subject.name);
  const [code, setCode] = useState(subject.code ?? "");
  const [category, setCategory] = useState<SubjectCategory>(subject.category);
  const { busy, error, run } = useSave(onClose);
  const boxes = fieldErrors(error);
  const nameProblem = name.trim() === "" ? "Enter the subject name" : boxes.name;

  return (
    <AppModal
      title={`Change ${subject.name}`}
      icon={Pencil}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <HeroButton variant="secondary" onPress={onClose} isDisabled={busy}>
            Cancel
          </HeroButton>
          <HeroButton
            variant="primary"
            isPending={busy}
            isDisabled={name.trim() === ""}
            onPress={() =>
              void run(async () => {
                await update({ id: subject.id, name: name.trim(), code: code.trim(), category }).unwrap();
                push("success", "Subject saved");
              })
            }
          >
            Save
          </HeroButton>
        </>
      }
    >
      <Field id="subject-edit-name" label="Subject name" error={nameProblem}>
        <Input id="subject-edit-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field id="subject-edit-code" label="Short code" optional hint="For a printed timetable, for example MAT." error={boxes.code}>
        <Input id="subject-edit-code" value={code} maxLength={10} onChange={(e) => setCode(e.target.value)} />
      </Field>
      <Field id="subject-edit-kind" label="Kind of subject">
        <Select id="subject-edit-kind" value={category} options={KINDS} onChange={(v) => setCategory(v as SubjectCategory)} />
      </Field>
      <ModalError message={error && !boxes.name && !boxes.code ? error.message : null} />
    </AppModal>
  );
}

/** The usual subjects as chips: pick the ones the school teaches and add them in one request. */
function UsualSubjects({ have }: { have: Set<string> }) {
  const [quickAdd, { isLoading }] = useQuickAddSubjectsMutation();
  const { push } = useToast();
  const [picked, setPicked] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);

  async function add() {
    setFailure(null);
    try {
      const res = await quickAdd(picked).unwrap();
      setPicked([]);
      push("success", `${res.data.created.length} subject${res.data.created.length === 1 ? "" : "s"} added`);
    } catch (err) {
      setFailure(getApiError(err)?.message ?? "Could not add the subjects. Please try again.");
    }
  }

  return (
    <Card className="space-y-3 p-5">
      <div>
        <h2 className="text-base font-bold text-foreground">Add the usual subjects</h2>
        <p className="text-sm text-foreground-muted">Tick the subjects your school teaches, then add them all at once.</p>
      </div>
      <div role="group" aria-label="The usual subjects" className="flex flex-wrap gap-2">
        {SUBJECT_PRESETS.map((name) => {
          const added = have.has(keyOf(name));
          const on = picked.includes(name);
          return (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              disabled={added}
              onClick={() => setPicked(on ? picked.filter((p) => p !== name) : [...picked, name])}
              className={cn(
                "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-default",
                added ? "border-success-line bg-success-soft text-success" : on ? "border-transparent bg-primary-soft text-primary-deep ring-2 ring-inset ring-primary/25" : "border-border bg-surface text-foreground hover:border-primary/50"
              )}
            >
              {(added || on) && <Check className="size-3.5" aria-hidden />}
              {name}
              {added && <span className="sr-only"> (already added)</span>}
            </button>
          );
        })}
      </div>
      {failure && <p role="alert" className="text-sm font-medium text-danger">{failure}</p>}
      <Button onClick={add} loading={isLoading} disabled={picked.length === 0}>
        <Plus className="size-4" aria-hidden />
        {picked.length === 0 ? "Add the ticked subjects" : `Add ${picked.length} subject${picked.length === 1 ? "" : "s"}`}
      </Button>
    </Card>
  );
}

/** A subject of the school's own: its name, a short code, and whether it has marks. */
function OwnSubject() {
  const [create] = useCreateSubjectMutation();
  const { push } = useToast();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState<SubjectCategory>("academic");
  const [tried, setTried] = useState(false);
  const { busy, error, run, clearError } = useSave(() => undefined);
  const boxes = fieldErrors(error);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (name.trim() === "") return;
    void run(async () => {
      await create({ name: name.trim(), ...(code.trim() ? { code: code.trim() } : {}), category }).unwrap();
      setName("");
      setCode("");
      setTried(false);
      push("success", "Subject added");
    });
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} noValidate className="space-y-3" aria-label="Add your own subject">
        <h2 className="text-base font-bold text-foreground">Add a subject of your own</h2>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)_auto] sm:items-start">
          <Field id="own-subject-name" label="Subject name" error={tried && name.trim() === "" ? "Enter the subject name" : boxes.name}>
            <Input id="own-subject-name" value={name} maxLength={40} onChange={(e) => { setName(e.target.value); clearError(); }} />
          </Field>
          <Field id="own-subject-code" label="Short code" optional error={boxes.code}>
            <Input id="own-subject-code" value={code} maxLength={10} onChange={(e) => { setCode(e.target.value); clearError(); }} />
          </Field>
          <Field id="own-subject-kind" label="Kind of subject">
            <Select id="own-subject-kind" value={category} options={KINDS} onChange={(v) => setCategory(v as SubjectCategory)} />
          </Field>
          <div className="sm:pt-[1.65rem]">
            <Button type="submit" loading={busy}>
              <Plus className="size-4" aria-hidden />
              Add
            </Button>
          </div>
        </div>
        {error && !boxes.name && !boxes.code && <p role="alert" className="text-sm font-medium text-danger">{error.message}</p>}
      </form>
    </Card>
  );
}

/**
 * Manage school > Timetable > Subjects (`/school/timetable/subjects`): the subjects the school teaches. The usual ones are added in one
 * click; others are typed. A subject is never deleted (marks and old timetables point to it): it is archived and can be brought back.
 */
export default function TimetableSubjectsPage() {
  const { push } = useToast();
  // A year that is over is only looked at: the school's subjects are shown, not added, changed or archived (the server refuses it too).
  const readOnly = useReadOnlyYear();
  const [view, setView] = useState<"active" | "archived">("active");
  const res = useGetSubjectsQuery("all");
  const [update] = useUpdateSubjectMutation();
  const [editing, setEditing] = useState<Subject | null>(null);
  const [archiving, setArchiving] = useState<Subject | null>(null);

  const all = res.data?.data.items ?? [];
  const shown = all.filter((s) => s.isActive === (view === "active"));
  const have = new Set(all.map((s) => keyOf(s.name)));
  const archivedCount = all.filter((s) => !s.isActive).length;

  return (
    <div className="space-y-6">
      <StudentFormHeader
        title="Subjects"
        subtitle="What your school teaches."
        crumbs={[{ label: "Dashboard", to: "/dashboard" }, { label: "Timetable", to: "/school/timetable" }]}
      />

      {!readOnly && <UsualSubjects have={have} />}
      {!readOnly && <OwnSubject />}

      <section aria-label="Your subjects" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold tracking-tight text-foreground">Your subjects</h2>
          <div role="tablist" aria-label="Which subjects to show" className="flex gap-1 rounded-xl border border-border bg-surface p-1 shadow-sm">
            {(["active", "archived"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cn("h-8 cursor-pointer rounded-lg px-3 text-sm font-semibold transition-colors", view === v ? "bg-primary-soft text-primary-deep" : "text-foreground-muted hover:text-foreground")}
              >
                {v === "active" ? "In use" : `Archived${archivedCount > 0 ? ` (${archivedCount})` : ""}`}
              </button>
            ))}
          </div>
        </div>

        {res.isLoading ? (
          <Skeleton className="h-40 rounded-2xl" />
        ) : res.error && !res.data ? (
          <Card className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the subjects."}</p>
            <Button variant="outline" onClick={() => res.refetch()}>
              Try again
            </Button>
          </Card>
        ) : shown.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface px-4 py-10 text-center text-sm text-foreground-muted">
            {view === "active" ? "No subjects yet. Add the usual ones above." : "No archived subjects."}
          </p>
        ) : (
          <Card className="relative overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead>
                <tr className="text-xs font-bold uppercase tracking-wider text-foreground-muted">
                  <th scope="col" className="px-4 py-3">Subject</th>
                  <th scope="col" className="px-4 py-3">Kind</th>
                  <th scope="col" className="px-4 py-3">Taught in</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 font-semibold text-foreground">
                        <BookOpen className="size-4 text-foreground-muted" aria-hidden />
                        {s.name}
                        {s.code && <Badge>{s.code}</Badge>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground-muted">{kindLabel(s.category)}</td>
                    <td className="px-4 py-3 text-foreground-muted">{s.sections === 0 ? "No class yet" : `${s.sections} class${s.sections === 1 ? "" : "es"}`}</td>
                    <td className="px-4 py-3">
                      <div className={readOnly ? "hidden" : "flex justify-end gap-2"}>
                        <Button variant="outline" size="sm" onClick={() => setEditing(s)} aria-label={`Change ${s.name}`}>
                          <Pencil className="size-4" aria-hidden />
                          Change
                        </Button>
                        {s.isActive ? (
                          <Button variant="ghost" size="sm" onClick={() => setArchiving(s)} aria-label={`Archive ${s.name}`}>
                            <Archive className="size-4" aria-hidden />
                            Archive
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={`Bring back ${s.name}`}
                            onClick={() => void update({ id: s.id, isActive: true }).unwrap().then(() => push("success", `${s.name} is back`), (err) => push("error", getApiError(err)?.message ?? "Could not bring it back."))}
                          >
                            <RotateCcw className="size-4" aria-hidden />
                            Bring back
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {editing && <SubjectDialog subject={editing} onClose={() => setEditing(null)} />}
      {archiving && (
        <ConfirmModal
          title={`Archive ${archiving.name}?`}
          confirmLabel="Archive"
          icon={Archive}
          tone="primary"
          onClose={() => setArchiving(null)}
          onConfirm={async () => {
            await update({ id: archiving.id, isActive: false }).unwrap();
            push("success", `${archiving.name} is archived`);
          }}
        >
          <p>It leaves the lists you pick from. Nothing is deleted, and you can bring it back. A subject a class still studies cannot be archived: take it out of that class first.</p>
        </ConfirmModal>
      )}
    </div>
  );
}
