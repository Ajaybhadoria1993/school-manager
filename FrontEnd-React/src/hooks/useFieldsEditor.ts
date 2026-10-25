import { useCallback, useMemo, useState } from "react";
import type { FieldRules, FormFieldKey } from "../constants/studentFields";
import { useGetStudentSettingsQuery, useUpdateStudentSettingsMutation } from "../redux/api/studentsApi";
import type { ExportColumn } from "../types";
import { getApiError } from "../utils/apiErrors";
import { defaultDraft, draftOf, isDefaultLayout, layoutOf, layoutProblems, sameDraft, tidyHeading, type FieldsDraft } from "../utils/exportLayout";

const sameLayout = (a: ExportColumn[], b: ExportColumn[]) => JSON.stringify(a.map((c) => [c.key, tidyHeading(c.heading)])) === JSON.stringify(b.map((c) => [c.key, tidyHeading(c.heading)]));
const changedRules = (a: FieldRules, b: FieldRules) => (Object.keys(a) as FormFieldKey[]).filter((k) => a[k] !== b[k]);

/** What a save came to: kept, refused for a heading (the list shows which one), or not saved for another reason (`error` says why). */
export type SaveResult = "saved" | "headings" | "failed";

/**
 * The school's fields as one list for Add student and the Excel (`GET` / `PUT /students/settings`): what is saved, the changes made to
 * it and not saved yet (the draft), what is wrong with a heading, and the one save that sends only what changed. Used by the Export page
 * and by the dialog that opens on Add student and on the empty Students page, so the list works the same everywhere. The settings are
 * read once (the screens share the copy); a save writes the answer into it, so the forms that read it follow at once.
 */
export function useFieldsEditor() {
  const settingsRes = useGetStudentSettingsQuery();
  const [save, { isLoading: saving }] = useUpdateStudentSettingsMutation();
  const settings = settingsRes.data?.data;

  // What is saved, as the list shows it (a field that is off is not asked; one that is on is asked).
  const base = useMemo<FieldsDraft | null>(() => (settings ? draftOf(settings) : null), [settings]);
  const [edited, setEdited] = useState<FieldsDraft | null>(null);
  const [serverProblems, setServerProblems] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const draft = edited ?? base;
  const layout = useMemo(() => (draft ? layoutOf(draft) : []), [draft]);
  // The heading problems by the field's key (the list shows the field where it stands).
  const problems = useMemo(() => {
    const byPlace = layoutProblems(layout);
    return { ...Object.fromEntries(Object.entries(byPlace).map(([i, message]) => [layout[Number(i)].key, message])), ...serverProblems };
  }, [layout, serverProblems]);
  const dirty = !!draft && !!base && !sameDraft(draft, base);
  const isDefault = !!draft && sameDraft(draft, defaultDraft(draft.custom));

  const change = useCallback((next: FieldsDraft) => {
    setEdited(next);
    setServerProblems({});
    setError(null);
  }, []);

  /** Back to what is saved: every change not saved yet is dropped. */
  const discard = useCallback(() => {
    setEdited(null);
    setServerProblems({});
    setError(null);
  }, []);

  /** Saves what changed (a default layout is saved as "no layout of our own"). */
  const saveDraft = useCallback(async (): Promise<SaveResult> => {
    if (!draft || !settings) return "failed";
    if (Object.keys(problems).length > 0) {
      setError("Fix the headings marked in red first.");
      return "headings";
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
      // The list stays as it is (a field switched off stays where it was); it now equals what is saved, so nothing is "not saved".
      return "saved";
    } catch (err) {
      const apiError = getApiError(err);
      const byKey: Record<string, string> = {};
      for (const d of (apiError?.details as { path?: string; message?: string }[] | undefined) ?? []) {
        const place = /^exportColumns\.(\d+)/.exec(d.path ?? "");
        if (place && d.message && layout[Number(place[1])]) byKey[layout[Number(place[1])].key] = d.message;
      }
      setServerProblems(byKey);
      const first = (apiError?.details as { message?: string }[] | undefined)?.[0]?.message;
      setError(first ? `${apiError?.message ?? "Could not save"}: ${first}` : (apiError?.message ?? "Could not save. Please try again."));
      return Object.keys(byKey).length > 0 ? "headings" : "failed";
    }
  }, [draft, settings, problems, layout, save]);

  return { settings, draft, layout, problems, dirty, isDefault, saving, error, setError, change, discard, saveDraft };
}

export type FieldsEditor = ReturnType<typeof useFieldsEditor>;
