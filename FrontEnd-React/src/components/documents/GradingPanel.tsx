import { useState } from "react";
import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useCan } from "../../hooks/useCan";
import { useGetDocumentSettingsQuery, useResetDocumentSettingsMutation, useSaveDocumentSettingsMutation } from "../../redux/api/documentsApi";
import type { DocumentSettings } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { fieldErrorsOf } from "../../utils/fees";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Skeleton } from "../ui/Skeleton";
import { Switch } from "../ui/Switch";
import { useToast } from "../ui/toast-context";

interface Draft {
  passPercent: string;
  bands: { min: string; grade: string }[];
  showRank: boolean;
  principalName: string;
}
const draftOf = (s: DocumentSettings): Draft => ({ passPercent: String(s.passPercent), bands: s.gradeBands.map((b) => ({ min: String(b.min), grade: b.grade })), showRank: s.showRank, principalName: s.principalName ?? "" });

function Form({ saved, mayChange }: { saved: DocumentSettings; mayChange: boolean }) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(saved));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [save, saving] = useSaveDocumentSettingsMutation();
  const [reset, resetting] = useResetDocumentSettingsMutation();
  const { push } = useToast();
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(saved));
  const setBand = (i: number, patch: Partial<Draft["bands"][number]>) => setDraft((d) => ({ ...d, bands: d.bands.map((b, at) => (at === i ? { ...b, ...patch } : b)) }));

  async function submit() {
    setProblem(null);
    const local: Record<string, string> = {};
    const pass = Number(draft.passPercent);
    if (!Number.isInteger(pass) || pass < 1 || pass > 100) local.passPercent = "The pass mark is 1 to 100";
    const bands = draft.bands.map((b) => ({ min: Number(b.min), grade: b.grade.trim() }));
    bands.forEach((b, i) => {
      if (!Number.isInteger(b.min) || b.min < 0 || b.min > 100) local[`gradeBands.${i}.min`] = "0 to 100";
      if (b.grade === "") local[`gradeBands.${i}.grade`] = "Enter the grade";
    });
    setErrors(local);
    if (Object.keys(local).length > 0) return;
    try {
      await save({ passPercent: pass, gradeBands: bands, showRank: draft.showRank, principalName: draft.principalName.trim() }).unwrap();
      push("success", "Grading saved");
    } catch (err) {
      const server = fieldErrorsOf(err, getApiError);
      setErrors(server);
      setProblem(Object.keys(server).length > 0 ? null : (getApiError(err)?.message ?? "Could not save. Please try again."));
    }
  }

  async function back() {
    try {
      const res = await reset().unwrap();
      setDraft(draftOf(res.data));
      setErrors({});
      push("success", "Back to the usual grades");
    } catch (err) {
      setProblem(getApiError(err)?.message ?? "Could not change it. Please try again.");
    }
  }

  return (
    <Card className="max-w-2xl space-y-5 p-5">
      <p className="text-sm text-foreground-secondary">
        How report cards grade and when a child passes. {saved.isDefault ? "The school has not set its own: the usual scale is in use." : "This is the school's own scale."}
      </p>

      <Field id="grading-pass" label="Pass mark (%)" error={errors.passPercent} hint="A subject below this percentage is not passed, and the exam is passed only when every subject is.">
        <Input id="grading-pass" inputMode="numeric" value={draft.passPercent} disabled={!mayChange} aria-invalid={!!errors.passPercent} onChange={(e) => setDraft((d) => ({ ...d, passPercent: e.target.value }))} />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-body-label">Grades</legend>
        <p className="text-xs text-foreground-muted">Each grade starts at a percentage. The lowest must start at 0, so every percentage has a grade.</p>
        {draft.bands.map((b, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="w-28">
              <Input aria-label={`Grade ${i + 1} starts at (%)`} inputMode="numeric" value={b.min} disabled={!mayChange} aria-invalid={!!errors[`gradeBands.${i}.min`]} onChange={(e) => setBand(i, { min: e.target.value })} />
            </div>
            <div className="w-40">
              <Input aria-label={`Grade ${i + 1} name`} value={b.grade} maxLength={12} disabled={!mayChange} aria-invalid={!!errors[`gradeBands.${i}.grade`]} onChange={(e) => setBand(i, { grade: e.target.value })} />
            </div>
            {mayChange && (
              <Button variant="ghost" size="sm" aria-label={`Remove grade ${i + 1}`} onClick={() => setDraft((d) => ({ ...d, bands: d.bands.filter((_, at) => at !== i) }))}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            )}
          </div>
        ))}
        {errors.gradeBands && (
          <p role="alert" className="text-xs text-danger">
            {errors.gradeBands}
          </p>
        )}
        {mayChange && draft.bands.length < 12 && (
          <Button variant="outline" size="sm" onClick={() => setDraft((d) => ({ ...d, bands: [...d.bands, { min: "", grade: "" }] }))}>
            <Plus className="size-4" aria-hidden />
            Add a grade
          </Button>
        )}
      </fieldset>

      <Field id="grading-principal" label="Principal's name" optional hint="Printed under the principal's line on report cards, admit cards and certificates.">
        <Input id="grading-principal" value={draft.principalName} maxLength={80} disabled={!mayChange} aria-invalid={!!errors.principalName} onChange={(e) => setDraft((d) => ({ ...d, principalName: e.target.value }))} />
      </Field>

      <Switch checked={draft.showRank} onChange={(v) => setDraft((d) => ({ ...d, showRank: v }))} disabled={!mayChange}>
        Show the child&apos;s rank in class on report cards
      </Switch>

      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
      {mayChange && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void submit()} loading={saving.isLoading} disabled={!dirty}>
            <Save className="size-4" aria-hidden />
            Save
          </Button>
          {!saved.isDefault && (
            <Button variant="outline" onClick={() => void back()} loading={resetting.isLoading}>
              <RotateCcw className="size-4" aria-hidden />
              Back to the usual grades
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

/** Documents > Grading: the pass mark, the grades, the principal's name and whether the rank is shown: what the report cards read. */
export function GradingPanel() {
  const can = useCan();
  const res = useGetDocumentSettingsQuery();
  const saved = res.data?.data;
  if (!saved) return res.error ? <Card className="px-5 py-8 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the grading."}</Card> : <Skeleton className="h-64 max-w-2xl rounded-2xl" />;
  // Keyed by what was saved, so a fresh save (or a reset) starts the form from it.
  return <Form key={JSON.stringify(saved)} saved={saved} mayChange={can("documents.manage")} />;
}
