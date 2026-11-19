import { useCallback, useMemo, useRef, useState } from "react";
import { DEFAULT_TEACHER_RULES, type TeacherFieldRules } from "../constants/teacherFields";
import { emptyTeacherForm, formKeyOfPath, teacherProblems, type TeacherFormKey, type TeacherFormValues, type TeacherProblems } from "../utils/teachers";

export const teacherFieldId = (key: TeacherFormKey) => `teacher-${key}`;

/**
 * The boxes of Add teacher and Change teacher. A wrong box shows its message once the person has left it or pressed Next / Save with it
 * wrong (`reveal`), never while they are still typing the first time. What the server refused is shown under its box until that box is
 * typed in again. Nothing is sent from here.
 */
export function useTeacherForm(initial: TeacherFormValues, options: { login: boolean; requireGender?: boolean; rules?: TeacherFieldRules }) {
  const rules = options.rules ?? DEFAULT_TEACHER_RULES;
  const [values, setValues] = useState<TeacherFormValues>(initial);
  const [revealed, setRevealed] = useState<ReadonlySet<TeacherFormKey>>(new Set());
  const [refused, setRefused] = useState<TeacherProblems>({});
  const problems = useMemo(() => teacherProblems(values, options), [values, options]);
  // The boxes a person has typed in: a username suggested from the name is only a suggestion until then.
  const typedKeys = useRef<Set<TeacherFormKey>>(new Set());

  /** `typed`: the person chose this value (a suggestion they clicked), so it is theirs from now on, like a value they typed. */
  const set = useCallback(<K extends TeacherFormKey>(key: K, value: TeacherFormValues[K], typed = false) => {
    if (typed) typedKeys.current.add(key);
    setValues((now) => ({ ...now, [key]: value }));
    setRefused((now) => {
      if (now[key] === undefined) return now;
      const { [key]: _gone, ...rest } = now;
      return rest;
    });
  }, []);

  const reveal = useCallback((keys: readonly TeacherFormKey[]) => setRevealed((now) => new Set([...now, ...keys])), []);

  /** The message to show under a box, or undefined. */
  const errorOf = (key: TeacherFormKey): string | undefined => refused[key] ?? (revealed.has(key) ? problems[key] : undefined);

  /**
   * A text box: its value, its change, and showing its message once it is left. `keep` cleans what is typed or pasted before it is
   * kept (only the digits of a mobile number or a PIN code), so a box never holds what it cannot take.
   */
  const bind = (key: Exclude<TeacherFormKey, "subjectIds" | "offDays" | "gender" | "employmentType">, keep?: (typed: string) => string) => ({
    id: teacherFieldId(key),
    value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      typedKeys.current.add(key);
      set(key, keep ? keep(e.target.value) : e.target.value);
    },
    onBlur: () => reveal([key]),
    "aria-invalid": errorOf(key) !== undefined ? true : undefined,
    "aria-describedby": errorOf(key) !== undefined ? `${teacherFieldId(key)}-error` : undefined,
  });

  /** Shows what the server refused under the boxes it names. Returns the boxes that are on this form (none: it was not about a box). */
  const showServerErrors = useCallback((details: unknown): TeacherFormKey[] => {
    const rows = Array.isArray(details) ? (details as { path?: unknown; message?: unknown }[]) : [];
    const found: TeacherProblems = {};
    const keys: TeacherFormKey[] = [];
    for (const row of rows) {
      const key = typeof row.path === "string" ? formKeyOfPath(row.path) : null;
      if (key && typeof row.message === "string" && found[key] === undefined) {
        found[key] = row.message;
        keys.push(key);
      }
    }
    if (keys.length > 0) setRefused((now) => ({ ...now, ...found }));
    return keys;
  }, []);

  /** Puts the cursor in the first of these boxes that is on the screen. */
  const focusFirst = useCallback((keys: readonly TeacherFormKey[]) => {
    for (const key of keys) {
      const box = document.getElementById(teacherFieldId(key));
      if (box) {
        box.focus();
        return;
      }
    }
  }, []);

  const reset = useCallback((next: TeacherFormValues = emptyTeacherForm()) => {
    typedKeys.current = new Set();
    setValues(next);
    setRevealed(new Set());
    setRefused({});
  }, []);

  const changed = useMemo(() => JSON.stringify(values) !== JSON.stringify(initial), [values, initial]);

  const wasTyped = (key: TeacherFormKey) => typedKeys.current.has(key);

  return { values, set, bind, errorOf, problems, reveal, showServerErrors, focusFirst, reset, changed, wasTyped, rules };
}

export type TeacherForm = ReturnType<typeof useTeacherForm>;
