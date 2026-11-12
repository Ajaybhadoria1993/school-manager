import { useRef, useState } from "react";
import type { BoardDraft } from "../../types";

export type FieldErrors = Record<string, string>;

/** A box holds text; a multiple choice holds a list; the boards hold a list of boards being filled in. */
export type FormValue = string | string[] | BoardDraft[];
export type FormValues = Record<string, FormValue>;

/**
 * Keeps what was typed in a step that has not been saved yet, so going Back (or opening another
 * step) and returning does not throw it away. The wizard owns the store; a saved step is cleared.
 */
export interface FormDraft {
  values?: FormValues;
  onChange: (values: FormValues) => void;
}

/**
 * Local state for one form step: the typed values, and the error shown under each field. Typing in a
 * field clears that field's error, and the errors of its parts ("boards.0.mediums" belongs to "boards").
 * Starts from the saved answers, with any unsaved draft laid over them (and `initialErrors` shown, for a screen opened to say what was wrong).
 */
export function useFormValues<T extends FormValues>(initial: T, draft?: FormDraft, initialErrors?: FieldErrors) {
  const [values, setValues] = useState<T>(() => ({ ...initial, ...draft?.values }));
  const [errors, setErrors] = useState<FieldErrors>(initialErrors ?? {});
  const latest = useRef(values);

  function set(key: keyof T & string, value: FormValue) {
    latest.current = { ...latest.current, [key]: value };
    setValues(latest.current);
    draft?.onChange(latest.current);
    setErrors((e) => {
      const stale = Object.keys(e).filter((name) => name === key || name.startsWith(key + "."));
      if (stale.length === 0) return e;
      const next = { ...e };
      for (const name of stale) delete next[name];
      return next;
    });
  }

  return { values, errors, set, setErrors };
}

/** Empty boxes arrive as null from the server; inputs want strings. */
export function str(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}
