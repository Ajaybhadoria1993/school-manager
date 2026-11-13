import { useCallback, useMemo, useState } from "react";
import { TEACHER_DETAILS } from "../constants/teacherFields";
import { useGetTeacherSettingsQuery, useUpdateTeacherSettingsMutation } from "../redux/api/timetableApi";
import type { ExportColumn, UpdateTeacherSettingsInput } from "../types";
import { getApiError } from "../utils/apiErrors";
import { layoutProblems, tidyHeading } from "../utils/exportLayout";
import {
  defaultTeacherColumnsDraft,
  defaultTeacherDraft,
  isDefaultTeacherLayout,
  sameTeacherDraft,
  teacherDraftOf,
  teacherLayoutOf,
  type TeacherFieldsDraft,
} from "../utils/teacherLayout";

const sameLayout = (a: ExportColumn[], b: ExportColumn[]) => JSON.stringify(a.map((c) => [c.key, tidyHeading(c.heading)])) === JSON.stringify(b.map((c) => [c.key, tidyHeading(c.heading)]));

/** What a save came to: kept, refused for a heading (the list shows which one), or not saved for another reason (`error` says why). */
export type TeacherSaveResult = "saved" | "headings" | "failed";

/**
 * The school's fields for its teachers (`GET` / `PUT /staff/teachers/settings`): what Add teacher asks of each usual detail, the school's
 * own fields, and the Excel's columns, two lists the school arranges on their own with one Mandatory. What is saved, the changes made to it and
 * not saved yet (the draft), what is wrong with a heading, and the one save that sends only what changed. Used by Manage fields and the
 * Export page. The settings are read once (the screens share the copy); a save writes the answer into it, so the forms that read it follow
 * at once.
 */
export function useTeacherFieldsEditor() {
  const settingsRes = useGetTeacherSettingsQuery();
  const [save, { isLoading: saving }] = useUpdateTeacherSettingsMutation();
  const settings = settingsRes.data?.data;

  const base = useMemo<TeacherFieldsDraft | null>(() => (settings ? teacherDraftOf(settings) : null), [settings]);
  const [edited, setEdited] = useState<TeacherFieldsDraft | null>(null);
  const [serverProblems, setServerProblems] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const draft = edited ?? base;
  const layout = useMemo(() => (draft ? teacherLayoutOf(draft) : []), [draft]);
  // The heading problems by the column's key (the list shows the column where it stands).
  const problems = useMemo(() => {
    const byPlace = layoutProblems(layout);
    return { ...Object.fromEntries(Object.entries(byPlace).map(([i, message]) => [layout[Number(i)].key, message])), ...serverProblems };
  }, [layout, serverProblems]);
  const dirty = !!draft && !!base && !sameTeacherDraft(draft, base);
  const isDefault = !!draft && sameTeacherDraft(draft, defaultTeacherDraft(draft.custom));
  // The Excel alone is a new school's (the form may not be): what the Export page's "Back to the default" is about.
  const isDefaultColumns = !!draft && sameLayout(layout, teacherLayoutOf(defaultTeacherColumnsDraft(draft)));

  const change = useCallback((next: TeacherFieldsDraft) => {
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

  /** Saves what changed (a layout that is a new school's own is saved as "no layout of our own"). */
  const saveDraft = useCallback(async (): Promise<TeacherSaveResult> => {
    if (!draft || !settings) return "failed";
    if (Object.keys(problems).length > 0) {
      setError("Fix the headings marked in red first.");
      return "headings";
    }
    const rules = TEACHER_DETAILS.map((d) => d.key).filter((k) => draft.rules[k] !== settings.fields[k]);
    const customChanged = JSON.stringify(draft.custom) !== JSON.stringify(settings.customFields);
    const layoutChanged = !sameLayout(layout, settings.exportColumns) || settings.exportIsDefault !== isDefaultTeacherLayout(layout, draft.custom);
    const body: UpdateTeacherSettingsInput = {
      ...(rules.length > 0 ? { fields: Object.fromEntries(rules.map((k) => [k, draft.rules[k]])) } : {}),
      ...(customChanged ? { customFields: draft.custom } : {}),
      ...(layoutChanged ? { exportColumns: isDefaultTeacherLayout(layout, draft.custom) ? null : layout.map((c) => ({ key: c.key, heading: tidyHeading(c.heading) })) } : {}),
    };
    if (Object.keys(body).length === 0) return "saved";
    setError(null);
    try {
      await save(body).unwrap();
      // The list stays as it is (a column switched off stays where it was); it now equals what is saved, so nothing is "not saved".
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

  return { settings, draft, layout, problems, dirty, isDefault, isDefaultColumns, saving, error, setError, change, discard, saveDraft };
}

export type TeacherFieldsEditor = ReturnType<typeof useTeacherFieldsEditor>;
