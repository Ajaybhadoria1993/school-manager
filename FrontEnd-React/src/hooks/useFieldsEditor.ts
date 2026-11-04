import { useCallback, useMemo, useState } from "react";
import { effectivePlacements, isUsualPlacements, isUsualSteps, type AdmitStepKey, type CustomFieldDef, type FieldRules, type FormFieldKey } from "../constants/studentFields";
import { useGetStudentSettingsQuery, useUpdateStudentSettingsMutation } from "../redux/api/studentsApi";
import type { ExportColumn } from "../types";
import { getApiError } from "../utils/apiErrors";
import { placeIn } from "../utils/placement";
import { defaultColumnsDraft, defaultDraft, draftOf, isDefaultLayout, layoutOf, layoutProblems, sameDraft, tidyHeading, type FieldsDraft } from "../utils/exportLayout";

const sameLayout = (a: ExportColumn[], b: ExportColumn[]) => JSON.stringify(a.map((c) => [c.key, tidyHeading(c.heading)])) === JSON.stringify(b.map((c) => [c.key, tidyHeading(c.heading)]));
const changedRules = (a: FieldRules, b: FieldRules) => (Object.keys(a) as FormFieldKey[]).filter((k) => a[k] !== b[k]);

/** What a save came to: kept, refused for a heading (the list shows which one), or not saved for another reason (`error` says why). */
export type SaveResult = "saved" | "headings" | "failed";

/**
 * The school's fields (`GET` / `PUT /students/settings`): what Add student asks (and the step of each detail) and the Excel's columns,
 * two lists the school arranges on their own, with one Mandatory. What is saved, the changes made to it and not saved yet (the draft),
 * what is wrong with a heading, and the one save that sends only what changed. Used by Manage fields, the Export page and Add student
 * (to add a field of its own on the spot). The settings are read once (the screens share the copy); a save writes the answer into it, so
 * the forms that read it follow at once.
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
  // The Excel alone is a new school's (the form may not be): what the Export page's "Back to the default" is about.
  const isDefaultColumns = !!draft && sameLayout(layout, layoutOf(defaultColumnsDraft(draft)));

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

  /** What the server said, as one line: its message and the first thing wrong. */
  const sayError = (apiError: ReturnType<typeof getApiError>) => {
    const first = (apiError?.details as { message?: string }[] | undefined)?.[0]?.message;
    return first ? `${apiError?.message ?? "Could not save"}: ${first}` : (apiError?.message ?? "Could not save. Please try again.");
  };

  /** Saves what changed (a default layout is saved as "no layout of our own", and so are the usual places of the details on Add student). */
  const saveDraft = useCallback(async (): Promise<SaveResult> => {
    if (!draft || !settings) return "failed";
    if (Object.keys(problems).length > 0) {
      setError("Fix the headings marked in red first.");
      return "headings";
    }
    const rules = changedRules(draft.rules, settings.fields);
    const customChanged = JSON.stringify(draft.custom) !== JSON.stringify(settings.customFields);
    const layoutChanged = !sameLayout(layout, settings.exportColumns) || settings.exportIsDefault !== isDefaultLayout(layout);
    // What the server keeps by itself (a new own field at the end of More details, a deleted one gone, a deleted step's details in More
    // details) is not a change of places.
    const placementsChanged = JSON.stringify(draft.placements) !== JSON.stringify(effectivePlacements(settings.placements, draft.custom, draft.steps));
    const stepsChanged = JSON.stringify(draft.steps) !== JSON.stringify(settings.steps);
    setError(null);
    try {
      await save({
        ...(rules.length > 0 ? { fields: Object.fromEntries(rules.map((k) => [k, draft.rules[k]])) } : {}),
        ...(customChanged ? { customFields: draft.custom } : {}),
        ...(layoutChanged ? { exportColumns: isDefaultLayout(layout) ? null : layout.map((c) => ({ key: c.key, heading: tidyHeading(c.heading) })) } : {}),
        ...(stepsChanged ? { steps: isUsualSteps(draft.steps) ? null : draft.steps } : {}),
        ...(placementsChanged ? { placements: isUsualPlacements(draft.placements, draft.custom) ? null : draft.placements } : {}),
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
      setError(sayError(apiError));
      return Object.keys(byKey).length > 0 ? "headings" : "failed";
    }
  }, [draft, settings, problems, layout, save]);

  /**
   * A field of the school's own added on the spot (Add student's last step): only it is sent, the field and its column at the end of the
   * Excel, and its place when it is not More details (the usual one for an own field). Whatever else the list holds is left as the
   * school saved it.
   */
  const addField = useCallback(
    async (field: CustomFieldDef, step: AdmitStepKey = "more"): Promise<SaveResult> => {
      if (!settings) return "failed";
      setError(null);
      const custom = [...settings.customFields, field];
      const places = step === "more" ? null : placeIn(effectivePlacements(settings.placements, custom, settings.steps), field.key, step);
      try {
        await save({
          customFields: custom,
          exportColumns: [...settings.exportColumns.map((c) => ({ key: c.key, heading: tidyHeading(c.heading) })), { key: field.key, heading: field.label }],
          ...(places ? { placements: isUsualPlacements(places, custom) ? null : places } : {}),
        }).unwrap();
        return "saved";
      } catch (err) {
        setError(sayError(getApiError(err)));
        return "failed";
      }
    },
    [settings, save]
  );

  return { settings, draft, layout, problems, dirty, isDefault, isDefaultColumns, saving, error, setError, change, discard, saveDraft, addField };
}

export type FieldsEditor = ReturnType<typeof useFieldsEditor>;
