import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Info, Plus, Trash2 } from "lucide-react";
import { MAX_PERIODS_PER_WEEK } from "../../constants/timetable";
import { useGetAllotmentsQuery, useGetSubjectsQuery, useGetTeachersQuery, useSaveAllotmentsMutation } from "../../redux/api/timetableApi";
import { getApiError } from "../../utils/apiErrors";
import { cn } from "../../utils/helpers";
import type { AllotmentInput, AllotmentView, UnitRef } from "../../types";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/toast-context";

/** A row being edited: the numbers are kept as typed until Save. */
interface Row {
  key: string;
  subjectId: string;
  periods: string;
  block: string;
  teacherId: string;
  group: string;
}

let counter = 0;
const newKey = () => `row-${(counter += 1)}`;

const BLOCKS = [
  { value: "1", label: "Single periods" },
  { value: "2", label: "Double periods" },
  { value: "3", label: "Triple periods" },
];

/** The periods a week the rows need: each subject once, and each choice once (its subjects are taught side by side). */
function needed(rows: Row[]): number {
  let total = 0;
  const groups = new Map<string, number>();
  for (const row of rows) {
    const periods = Number(row.periods) || 0;
    const group = row.group.trim().toLowerCase();
    if (group) groups.set(group, Math.max(groups.get(group) ?? 0, periods));
    else total += periods;
  }
  for (const periods of groups.values()) total += periods;
  return total;
}

const toRows = (view: AllotmentView): Row[] =>
  view.rows.map((r) => ({ key: newKey(), subjectId: r.subjectId, periods: String(r.periodsPerWeek), block: String(r.blockSize), teacherId: r.teacherId ?? "", group: r.group ?? "" }));

/** What the server said about one row's box: "rows.2.periodsPerWeek" becomes the row 2. */
function rowProblems(details: unknown): Map<number, string[]> {
  const found = new Map<number, string[]>();
  for (const d of Array.isArray(details) ? (details as { path?: string; message?: string }[]) : []) {
    const match = /^rows\.(\d+)\./.exec(d.path ?? "");
    if (match && d.message) found.set(Number(match[1]), [...(found.get(Number(match[1])) ?? []), d.message]);
  }
  return found;
}

/**
 * What one class (or section) studies, edited inside its timetable: its subjects, how many periods a week each gets, single or double
 * periods (a lab), who teaches it, and choices (a third language: its subjects are taught in the same periods). The same list can be given
 * to the class's other sections. Nothing is sent until Save (`PUT /subjects/allotments`); `onSaved` then lets the timetable read itself again.
 */
export function ClassSubjectsEditor({ unit, onSaved, onCancel }: { unit: UnitRef; onSaved: () => void; onCancel?: () => void }) {
  const { push } = useToast();
  const subjects = useGetSubjectsQuery("active").data?.data.items ?? [];
  const teachers = useGetTeachersQuery({ status: "active" }).data?.data.items ?? [];
  const [save, { isLoading: saving }] = useSaveAllotmentsMutation();
  const view = useGetAllotmentsQuery(unit);
  // `currentData`, not `data`: the list of another class is never shown (or saved) under this one.
  const data = view.currentData?.data;

  const [rows, setRows] = useState<Row[]>([]);
  const [alsoSections, setAlsoSections] = useState<string[]>([]);
  const [withTeachers, setWithTeachers] = useState(false);
  const [failure, setFailure] = useState<{ message: string; details?: unknown } | null>(null);
  const [loadedFor, setLoadedFor] = useState<unknown>(null);

  // The rows start from what the server has, once per read (not again while the person is typing).
  useEffect(() => {
    if (data && loadedFor !== data) {
      setRows(toRows(data));
      setAlsoSections([]);
      setFailure(null);
      setLoadedFor(data);
    }
  }, [data, loadedFor]);

  if (!data) {
    return view.error ? (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-danger">{getApiError(view.error)?.message ?? "Could not load this class's subjects."}</p>
        <Button variant="outline" onClick={() => view.refetch()}>
          Try again
        </Button>
      </div>
    ) : (
      <Skeleton className="h-40 rounded-xl" />
    );
  }

  const used = new Set(rows.map((r) => r.subjectId));
  const free = subjects.filter((s) => !used.has(s.id));
  const total = needed(rows);
  const available = data.totals.available;
  const over = available !== null && total > available;
  const problems = rowProblems(failure?.details);
  const change = (key: string, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const subjectName = (id: string) => subjects.find((s) => s.id === id)?.name ?? data.rows.find((r) => r.subjectId === id)?.subjectName ?? "A subject";
  const dirty = JSON.stringify(rows.map(({ key: _key, ...r }) => r)) !== JSON.stringify(toRows(data).map(({ key: _key, ...r }) => r));

  const body = (): AllotmentInput[] =>
    rows.map((r) => ({ subjectId: r.subjectId, periodsPerWeek: Math.round(Number(r.periods)) || 0, blockSize: Number(r.block) || 1, teacherId: r.teacherId || null, group: r.group.trim() || null }));

  async function submit() {
    setFailure(null);
    if (rows.some((r) => !(Number(r.periods) >= 1))) {
      setFailure({ message: "Enter the periods a week for every subject (at least 1)." });
      return;
    }
    try {
      await save({ ...unit, rows: body(), alsoSections, withTeachers }).unwrap();
      push("success", alsoSections.length > 0 ? "Subjects saved, and given to the other sections too" : "Subjects saved");
      setLoadedFor(null);
      onSaved();
    } catch (err) {
      const e = getApiError(err);
      setFailure({ message: e?.message ?? "Could not save. Please try again.", details: e?.details });
    }
  }

  return (
    <div className="space-y-4">
      <p className={cn("text-sm font-semibold", over ? "text-danger" : "text-foreground-muted")} role="status" aria-label="Periods a week">
        {available === null ? `${total} periods a week.` : `${total} of ${available} periods a week${over ? ": too many, they will not fit" : ""}`}
      </p>

      {subjects.length === 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Your school has no subjects yet.{" "}
            <Link to="/school/timetable/subjects" className="font-semibold underline">
              Add them first
            </Link>
            .
          </span>
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-foreground-muted">No subject yet. Add the first one below.</p>
      ) : (
        <div className="space-y-2">
          <div aria-hidden className="hidden gap-3 px-3 text-xs font-bold uppercase tracking-wider text-foreground-muted sm:grid sm:grid-cols-[minmax(0,1.2fr)_6rem_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_2.5rem]">
            <span>Subject</span>
            <span>A week</span>
            <span>How they come</span>
            <span>Teacher</span>
            <span>Choice</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <div key={r.key} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[minmax(0,1.2fr)_6rem_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-start" role="group" aria-label={subjectName(r.subjectId)}>
              <p className="flex h-10 items-center text-sm font-bold text-foreground">{subjectName(r.subjectId)}</p>
              <Input aria-label={`${subjectName(r.subjectId)}: periods a week`} type="number" min={1} max={MAX_PERIODS_PER_WEEK} value={r.periods} onChange={(e) => change(r.key, { periods: e.target.value })} />
              <Select aria-label={`${subjectName(r.subjectId)}: how its periods come`} value={r.block} options={BLOCKS} onChange={(v) => change(r.key, { block: v })} />
              <Select
                aria-label={`${subjectName(r.subjectId)}: teacher`}
                value={r.teacherId}
                placeholder="No teacher yet"
                // The teachers who can teach this subject come first.
                options={[
                  { value: "", label: "No teacher yet" },
                  ...[...teachers].sort((a, b) => Number(b.subjectIds.includes(r.subjectId)) - Number(a.subjectIds.includes(r.subjectId))).map((t) => ({ value: t.id, label: t.name })),
                ]}
                onChange={(v) => change(r.key, { teacherId: v })}
              />
              <Input aria-label={`${subjectName(r.subjectId)}: choice`} placeholder="Choice (optional)" value={r.group} maxLength={30} onChange={(e) => change(r.key, { group: e.target.value })} />
              <Button variant="ghost" aria-label={`Take ${subjectName(r.subjectId)} out`} onClick={() => setRows((all) => all.filter((x) => x.key !== r.key))} className="text-danger hover:bg-danger-soft hover:text-danger">
                <Trash2 className="size-4" aria-hidden />
              </Button>
              {(problems.get(i) ?? []).map((m) => (
                <p key={m} role="alert" className="text-xs font-medium text-danger sm:col-span-6">
                  {m}
                </p>
              ))}
            </div>
          ))}
          <p className="px-1 text-xs text-foreground-muted">
            <strong>Choice</strong>: for subjects the students pick one of (a third language). Give them the same choice name and they are taught in the same periods.
          </p>
        </div>
      )}

      {free.length > 0 && (
        <div className="flex max-w-sm items-center gap-2">
          <div className="min-w-0 flex-1">
            <Select
              aria-label="Add a subject"
              value=""
              placeholder="+ Add a subject"
              options={free.map((s) => ({ value: s.id, label: s.name }))}
              onChange={(v) => v && setRows((all) => [...all, { key: newKey(), subjectId: v, periods: "5", block: "1", teacherId: "", group: "" }])}
            />
          </div>
          <Plus className="size-5 text-foreground-muted" aria-hidden />
        </div>
      )}

      {data.siblings.length > 0 && (
        <div className="space-y-2 rounded-xl bg-surface-muted p-3">
          <p className="text-sm font-semibold text-foreground">Give this list to the other sections too</p>
          <div role="group" aria-label="Other sections" className="flex flex-wrap gap-2">
            {data.siblings.map((s) => {
              const on = alsoSections.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setAlsoSections(on ? alsoSections.filter((x) => x !== s.id) : [...alsoSections, s.id])}
                  className={cn(
                    "h-8 cursor-pointer rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                    on ? "border-transparent bg-primary-soft text-primary-deep ring-2 ring-inset ring-primary/25" : "border-border bg-surface text-foreground-muted hover:border-primary/50"
                  )}
                >
                  {data.unit.className} - {s.name}
                </button>
              );
            })}
          </div>
          {alsoSections.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input type="checkbox" className="size-4 accent-primary" checked={withTeachers} onChange={(e) => setWithTeachers(e.target.checked)} />
              With the same teachers (usually each section has its own)
            </label>
          )}
        </div>
      )}

      {failure && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          {failure.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void submit()} loading={saving} disabled={!dirty && alsoSections.length === 0}>
          Save subjects
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {dirty ? "Cancel" : "Close"}
          </Button>
        )}
      </div>
    </div>
  );
}
