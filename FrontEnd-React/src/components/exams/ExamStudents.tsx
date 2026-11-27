import { useState } from "react";
import { useSearchParams } from "react-router";
import { ListOrdered, Save, Search } from "lucide-react";
import { useGetExamRosterQuery, useSaveRollNumbersMutation } from "../../redux/api/examsApi";
import type { ExamDetail, ExamRoster, RosterRow } from "../../types";
import { useReadOnlyYear } from "../../hooks/useReadOnlyYear";
import { getApiError } from "../../utils/apiErrors";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/toast-context";
import { classesOfExam } from "../../utils/exams";

const ALL_SECTIONS = "all";
/** The highest roll number a school gives (the server's MAX_ROLL_NUMBER). */
const MAX_ROLL = 999;

/**
 * Exam > Students (2026-11-27, the user: "ek tab jismein sab bacche hon, filter laga ho, har bacche ka naam, father name, uska roll number; admission
 * ke time roll number nahi diya to yahan de sakein"): a class of the exam (and one of its sections, or all), a search, and every child with their
 * roll number (a box: given, changed or cleared here; Number the rest gives the children without one the next numbers, A to Z), name and admission
 * number, father's name and room. One Save sends the changed numbers; the roll number is the child's own in their class (the admission's).
 */
export function ExamStudents({ exam }: { exam: ExamDetail }) {
  const [params, setParams] = useSearchParams();
  const classes = classesOfExam(exam);
  const klass = classes.find((c) => c.id === params.get("class")) ?? classes[0];
  const section = params.get("section") ?? ALL_SECTIONS;
  const res = useGetExamRosterQuery({ examId: exam.id, classId: klass.id, sectionId: section === ALL_SECTIONS ? null : section });
  const roster = res.currentData?.data;
  const [search, setSearch] = useState("");

  const keep = (changes: Record<string, string | null>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      return next;
    });

  return (
    <div className="space-y-4">
      <Card className="grid gap-4 px-5 py-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,12rem)_minmax(0,1fr)]">
        <Field id="students-class" label="Class" quiet>
          <Select id="students-class" value={klass.id} onChange={(id) => keep({ class: id, section: null })} options={classes.map((c) => ({ value: c.id, label: c.name }))} />
        </Field>
        <Field id="students-section" label="Section" quiet>
          <Select
            id="students-section"
            value={section}
            disabled={!roster || roster.sections.length === 0}
            onChange={(id) => keep({ section: id === ALL_SECTIONS ? null : id })}
            options={[{ value: ALL_SECTIONS, label: roster && roster.sections.length === 0 ? "No sections" : "All sections" }, ...(roster?.sections ?? []).map((s) => ({ value: s.id, label: s.name }))]}
          />
        </Field>
        <Field id="students-search" label="Search" quiet>
          <Input id="students-search" icon={Search} placeholder="Name, father's name or admission no." value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
      </Card>

      {res.isFetching && !roster ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !roster ? (
        <Card className="px-5 py-8 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the children."}</Card>
      ) : (
        <RosterTable key={`${roster.classId}:${roster.sectionId ?? ""}`} examId={exam.id} roster={roster} search={search} />
      )}
    </div>
  );
}

const matches = (row: RosterRow, search: string) => {
  const q = search.trim().toLowerCase();
  return q === "" || [row.name, row.fatherName ?? "", row.admissionNumber].some((v) => v.toLowerCase().includes(q));
};

function RosterTable({ examId, roster, search }: { examId: string; roster: ExamRoster; search: string }) {
  const readOnly = useReadOnlyYear();
  const toast = useToast();
  const [save, saving] = useSaveRollNumbersMutation();
  /** What the boxes say where they differ from the saved roll number ("" is none). */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const boxOf = (row: RosterRow) => drafts[row.id] ?? (row.rollNumber === null ? "" : String(row.rollNumber));
  const valueOf = (row: RosterRow): number | null => (boxOf(row).trim() === "" ? null : Number(boxOf(row)));
  const changed = roster.items.filter((row) => valueOf(row) !== row.rollNumber);
  const shown = roster.items.filter((row) => matches(row, search));
  const hasSections = roster.sections.length > 0;

  function type(row: RosterRow, value: string) {
    setDrafts((all) => ({ ...all, [row.id]: value }));
    setProblems((all) => {
      const next = { ...all };
      delete next[row.id];
      return next;
    });
  }

  /** The children with no number get the next ones of their section (after the highest there), A to Z by name. */
  function numberTheRest() {
    const next: Record<string, string> = { ...drafts };
    const bySection = new Map<string, RosterRow[]>();
    for (const row of roster.items) bySection.set(row.sectionId ?? "", [...(bySection.get(row.sectionId ?? "") ?? []), row]);
    for (const rows of bySection.values()) {
      let top = Math.max(0, ...rows.map((r) => valueOf(r) ?? 0).filter((n) => Number.isFinite(n)));
      for (const row of rows.filter((r) => boxOf(r).trim() === "").sort((a, b) => a.name.localeCompare(b.name))) {
        if (top >= MAX_ROLL) break;
        top += 1;
        next[row.id] = String(top);
      }
    }
    setDrafts(next);
  }

  async function saveAll() {
    setFailed(null);
    const found: Record<string, string> = {};
    const used = new Map<string, string>();
    for (const row of roster.items) {
      const value = valueOf(row);
      if (value === null) continue;
      if (!Number.isInteger(value) || value < 1 || value > MAX_ROLL) {
        found[row.id] = `A roll number is 1 to ${MAX_ROLL}`;
        continue;
      }
      const key = `${row.sectionId ?? ""}:${value}`;
      if (used.has(key)) found[row.id] = `Roll number ${value} is given twice`;
      else used.set(key, row.id);
    }
    setProblems(found);
    if (Object.keys(found).length > 0 || changed.length === 0) return;
    const rows = changed.map((row) => ({ studentId: row.id, rollNumber: valueOf(row) }));
    try {
      await save({ examId, rows }).unwrap();
      setDrafts({});
      toast.push("success", `${rows.length} roll ${rows.length === 1 ? "number" : "numbers"} saved.`);
    } catch (err) {
      const e = getApiError(err);
      const details = Array.isArray(e?.details) ? (e.details as { path?: string; message?: string }[]) : [];
      const perRow: Record<string, string> = {};
      for (const d of details) {
        const at = /^rows\.(\d+)\./.exec(d.path ?? "");
        if (at && rows[Number(at[1])] && d.message) perRow[rows[Number(at[1])].studentId] = d.message;
      }
      setProblems(perRow);
      if (Object.keys(perRow).length === 0) setFailed(e?.message ?? "Could not save the roll numbers. Please try again.");
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <p className="text-sm text-foreground">
          <span className="font-semibold">{`${roster.counts.students} ${roster.counts.students === 1 ? "child" : "children"}`}</span>
          <span className="text-foreground-muted">{` · ${roster.counts.withoutRoll} without a roll number · ${roster.counts.withoutRoom} without a room`}</span>
        </p>
        {!readOnly && roster.items.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={numberTheRest} disabled={!roster.items.some((r) => boxOf(r).trim() === "")}>
              <ListOrdered className="size-4" aria-hidden />
              Number the rest
            </Button>
            <Button size="sm" onClick={() => void saveAll()} disabled={changed.length === 0 || saving.isLoading}>
              <Save className="size-4" aria-hidden />
              Save roll numbers
            </Button>
          </div>
        )}
      </div>
      {failed && (
        <p role="alert" className="border-b border-danger-line bg-danger-soft px-5 py-2.5 text-sm font-semibold text-danger">
          {failed}
        </p>
      )}
      {roster.items.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm font-semibold text-foreground-muted">No children in {roster.className} yet</p>
      ) : shown.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm font-semibold text-foreground-muted">Nobody matches</p>
      ) : (
        <div className="overflow-x-auto">
          <table aria-label={`Children of ${roster.className}`} className="w-full min-w-[44rem] text-left text-sm">
            <thead className="bg-surface-muted/50">
              <tr className="text-xs font-bold uppercase tracking-wide text-foreground-muted">
                <th scope="col" className="w-36 px-5 py-3">Roll no.</th>
                <th scope="col" className="px-4 py-3">Student</th>
                <th scope="col" className="px-4 py-3">Father&apos;s name</th>
                {hasSections && <th scope="col" className="px-4 py-3">Section</th>}
                <th scope="col" className="px-4 py-3">Room</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((row) => (
                <tr key={row.id} className="align-top transition-colors hover:bg-surface-muted/40">
                  <td className="px-5 py-2.5">
                    {readOnly ? (
                      <span className="font-semibold text-foreground">{row.rollNumber ?? "–"}</span>
                    ) : (
                      <>
                        <Input
                          type="number"
                          min={1}
                          max={MAX_ROLL}
                          aria-label={`Roll number of ${row.name}`}
                          placeholder="Give"
                          value={boxOf(row)}
                          aria-invalid={problems[row.id] ? true : undefined}
                          onChange={(e) => type(row, e.target.value)}
                          className="w-24"
                        />
                        {problems[row.id] && <p className="mt-1 text-xs font-medium text-danger">{problems[row.id]}</p>}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="block font-semibold text-foreground">{row.name}</span>
                    <span className="block text-xs text-foreground-muted">{row.admissionNumber}</span>
                  </td>
                  <td className="px-4 py-3 text-foreground">{row.fatherName ?? <span className="text-foreground-muted">–</span>}</td>
                  {hasSections && <td className="px-4 py-3 text-foreground">{row.sectionName ?? "–"}</td>}
                  <td className="px-4 py-3">{row.room ? <span className="font-semibold text-foreground">{row.room}</span> : <span className="text-foreground-muted">–</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
