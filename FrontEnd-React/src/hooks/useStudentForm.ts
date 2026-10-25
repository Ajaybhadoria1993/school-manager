import { useCallback, useMemo, useRef, useState } from "react";
import type { GuardianMatch, Relation } from "../types";
import { isIndianMobile } from "../utils/validators";
import {
  checkStudentForm,
  emptyGuardian,
  freeRelation,
  getAt,
  mobileDigits,
  setAt,
  type FormErrors,
  type GuardianDraft,
  type StudentFormValues,
} from "../utils/students";
import { MAX_GUARDIANS } from "../constants/students";
import type { CustomFieldDef, FieldRules } from "../constants/studentFields";
import { effectiveRules } from "../utils/fieldRules";

/** The id a box gets from its path, so a message, a label and "go to the first mistake" all find it. */
export const fieldId = (path: string) => `student-${path.replace(/\./g, "-")}`;

/** What a guardian's lookup is doing, by the guardian's key. */
export type LookupState = "checking" | "failed";

/** The boxes only (not what the lookup found), for "has anything changed?". */
const dataOf = (v: StudentFormValues) => ({
  ...v,
  guardians: v.guardians.map(({ key: _key, match, lookedUp: _lookedUp, manual: _manual, choice, ...g }) => ({ ...g, matchId: match?.id ?? null, choice })),
});

/**
 * Everything typed into the admission form (or a student's edit form) and not sent yet.
 *  - Nothing is sent while typing. `submit` (the one Admit / Save button, or Enter in a box) checks every box with the server's own
 *    words first; what is wrong shows under its box and nothing is sent.
 *  - A box shows its message once it was left (or after a first try to save), so a first-time user is not greeted by red.
 *  - Escape in a box puts back what it held when the form started (the saved value on a student's page).
 *  - The server's own answers are shown under the same boxes (`showServerErrors`, by the same paths) until that box changes.
 *  - On the admission form, a guardian's mobile number is looked up (one POST) when exactly 10 valid digits are there and the number
 *    is not the one looked up last; a parent the school already has is then shown, with "use as is" or "update".
 */
export function useStudentForm(
  initial: StudentFormValues,
  options: {
    mode: "admit" | "edit";
    /** Whether a class has sections this year (then a section is required). */
    classHasSections: (classId: string) => boolean;
    /** The admission form's lookup of a parent by mobile number. */
    lookup?: (mobile: string) => Promise<GuardianMatch | null>;
    /** What this school needs (its settings); a needed box left empty has its message. */
    rules?: FieldRules;
    /** The name of a class, from its id: the previous school is needed only for a student of Class 1 to 12 (the class chosen decides). */
    classNameOf?: (classId: string) => string | undefined;
    /** The school's own fields (its settings): asked as the school wants each, checked for its kind. */
    custom?: CustomFieldDef[];
  }
) {
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [touched, setTouched] = useState<Record<string, true>>({});
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FormErrors>({});
  const [lookups, setLookups] = useState<Record<string, LookupState>>({});
  const latest = useRef(values);
  latest.current = values;

  const { classHasSections, lookup, mode, rules: schoolRules, classNameOf, custom } = options;
  // What the school needs of THIS admission: its rules with the address always needed and the previous school needed by the class chosen.
  const rules = useMemo(() => (schoolRules ? effectiveRules(schoolRules, classNameOf?.(values.classId)) : undefined), [schoolRules, classNameOf, values.classId]);
  const problems = useMemo(
    () =>
      checkStudentForm(values, {
        classHasSections: classHasSections(values.classId),
        admissionDateRequired: mode === "edit",
        rules,
        saved: mode === "edit" ? saved : undefined,
        custom: custom?.filter((f) => f.mode !== "hidden"),
      }),
    [values, classHasSections, mode, rules, saved, custom]
  );

  const dirty = useMemo(() => JSON.stringify(dataOf(values)) !== JSON.stringify(dataOf(saved)), [values, saved]);

  /** The message under a box: the server's answer first, then the screen's own check once the box was left or Save was tried. */
  const errorOf = useCallback(
    (path: string) => serverErrors[path] ?? (attempted || touched[path] ? problems[path] : undefined),
    [serverErrors, attempted, touched, problems]
  );

  /** A box that changes drops the server's message about it (and a guardian's change drops the one about the guardians). */
  const forget = useCallback(
    (path: string) =>
      setServerErrors((current) => {
        if (!(path in current) && !(path.startsWith("guardians") && "guardians" in current)) return current;
        const next = { ...current };
        delete next[path];
        if (path.startsWith("guardians")) delete next.guardians;
        return next;
      }),
    []
  );

  const set = useCallback(
    (path: string, value: unknown) => {
      setValues((v) => setAt(v, path, value));
      forget(path);
    },
    [forget]
  );

  const touch = useCallback((path: string) => setTouched((t) => (t[path] ? t : { ...t, [path]: true })), []);

  // ---- guardians -------------------------------------------------------------------------------------------------------

  const setGuardian = useCallback(
    (index: number, patch: Partial<GuardianDraft>) => {
      setValues((v) => ({ ...v, guardians: v.guardians.map((g, i) => (i === index ? { ...g, ...patch } : g)) }));
      for (const field of Object.keys(patch)) forget(`guardians.${index}.${field}`);
    },
    [forget]
  );

  /** Asks the server whether the school has a parent with this number; the answer only lands if the box still holds that number. */
  const lookUp = useCallback(
    async (key: string, mobile: string) => {
      if (!lookup) return;
      setLookups((l) => ({ ...l, [key]: "checking" }));
      let match: GuardianMatch | null = null;
      let failed = false;
      try {
        match = await lookup(mobile);
      } catch {
        failed = true;
      }
      setLookups((l) => {
        const next = { ...l };
        if (failed) next[key] = "failed";
        else delete next[key];
        return next;
      });
      setValues((v) => ({
        ...v,
        guardians: v.guardians.map((g) =>
          g.key !== key || g.mobile !== mobile
            ? g
            : match
              ? {
                  ...g,
                  match,
                  choice: "use",
                  name: match.name,
                  alternateMobile: match.alternateMobile ?? "",
                  email: match.email ?? "",
                  occupation: match.occupation ?? "",
                }
              : { ...g, match: null }
        ),
      }));
    },
    [lookup]
  );

  /** A mobile box: digits only; a new complete number is looked up once; a changed number forgets the parent found before. */
  const setMobile = useCallback(
    (index: number, typed: string) => {
      const mobile = mobileDigits(typed);
      const g = latest.current.guardians[index];
      if (!g || g.mobile === mobile) return;
      const others = latest.current.guardians.filter((_, i) => i !== index).map((o) => o.mobile);
      const looksUp = mode === "admit" && !g.id && isIndianMobile(mobile) && mobile !== g.lookedUp && !others.includes(mobile);
      const forgetMatch = g.match ? { match: null, name: "", alternateMobile: "", email: "", occupation: "", choice: "use" as const } : {};
      setGuardian(index, { mobile, ...forgetMatch, ...(looksUp ? { lookedUp: mobile } : {}) });
      if (looksUp) void lookUp(g.key, mobile);
    },
    [mode, setGuardian, lookUp]
  );

  const addGuardian = useCallback(() => {
    // The one added starts as the father or the mother, whichever the child does not have yet, then as a Guardian (a child has one father
    // and one mother).
    setValues((v) => (v.guardians.length >= MAX_GUARDIANS ? v : { ...v, guardians: [...v.guardians, emptyGuardian(false, freeRelation(v.guardians))] }));
  }, []);

  const removeGuardian = useCallback((index: number) => {
    setValues((v) => {
      const guardians = v.guardians.filter((_, i) => i !== index);
      // The primary one cannot disappear: the first one left takes over.
      if (guardians.length > 0 && !guardians.some((g) => g.isPrimary)) guardians[0] = { ...guardians[0], isPrimary: true };
      return { ...v, guardians };
    });
    setServerErrors({});
  }, []);

  const makePrimary = useCallback(
    (index: number) => {
      setValues((v) => ({ ...v, guardians: v.guardians.map((g, i) => ({ ...g, isPrimary: i === index })) }));
      forget("guardians");
    },
    [forget]
  );

  /** The server says the school has this parent (409 GUARDIAN_EXISTS): show them, as if the lookup had found them. */
  const showMatch = useCallback((index: number, match: GuardianMatch) => {
    setValues((v) =>
      setAt(v, `guardians.${index}`, {
        ...v.guardians[index],
        match,
        lookedUp: v.guardians[index].mobile,
        choice: "use",
        name: match.name,
        alternateMobile: match.alternateMobile ?? "",
        email: match.email ?? "",
        occupation: match.occupation ?? "",
      })
    );
  }, []);

  // ---- the whole form --------------------------------------------------------------------------------------------------

  /** Escape: the box goes back to what it held when the form started. */
  const revert = useCallback(
    (path: string) => {
      const mobile = /^guardians\.(\d+)\.mobile$/.exec(path);
      if (mobile) setMobile(Number(mobile[1]), String(getAt(saved, path) ?? ""));
      else set(path, getAt(saved, path));
    },
    [saved, set, setMobile]
  );

  /**
   * The props of a text box at `path`: its id, value, what typing does, the message's id for a screen reader, Escape to revert.
   * `digits` keeps only digits (a PIN code, a roll number).
   */
  const bind = useCallback(
    (path: string, kind: "text" | "digits" = "text") => ({
      id: fieldId(path),
      name: path,
      value: String(getAt(values, path) ?? ""),
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(path, kind === "digits" ? e.target.value.replace(/\D/g, "") : e.target.value),
      onBlur: () => touch(path),
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Escape") {
          e.preventDefault();
          revert(path);
        }
      },
      "aria-invalid": !!errorOf(path),
      "aria-describedby": errorOf(path) ? `${fieldId(path)}-error` : undefined,
    }),
    [values, set, touch, revert, errorOf]
  );

  /** In the order of the page: the first of these boxes that is on screen gets the focus (a box of a step not shown is not there). */
  const focusFirst = useCallback((paths: string[]) => {
    requestAnimationFrame(() => {
      const boxes = paths.map((path) => document.getElementById(fieldId(path))).filter((el): el is HTMLElement => !!el);
      boxes.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      boxes[0]?.focus();
      boxes[0]?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, []);

  /** The one Admit / Save: true when every box is right; otherwise every message shows and the first wrong box gets the focus. */
  const check = useCallback((): boolean => {
    setAttempted(true);
    const wrong = Object.keys(problems);
    if (wrong.length === 0) return true;
    focusFirst(wrong);
    return false;
  }, [problems, focusFirst]);

  /** Shows the messages of these boxes (a step of the admission is checked on its own) and puts the focus on the first. */
  const reveal = useCallback(
    (paths: string[]) => {
      setTouched((t) => ({ ...t, ...Object.fromEntries(paths.map((path) => [path, true as const])) }));
      focusFirst(paths);
    },
    [focusFirst]
  );

  /** The server's answer, under the same boxes ([{ path, message }]). */
  const showServerErrors = useCallback((details: unknown) => {
    if (!Array.isArray(details)) return false;
    const next: FormErrors = {};
    for (const d of details) {
      if (d && typeof d.path === "string" && typeof d.message === "string") next[d.path] = d.message;
    }
    setServerErrors(next);
    setAttempted(true);
    const first = Object.keys(next)[0];
    if (first) requestAnimationFrame(() => document.getElementById(fieldId(first))?.focus());
    return Object.keys(next).length > 0;
  }, []);

  /**
   * Some of the changes were saved (one Save sends several requests and one of them may be refused): those boxes become the new
   * "saved" values, so the next Save sends only what is still different.
   */
  const rebase = useCallback((paths: string[]) => {
    setSaved((s) => paths.reduce((next, path) => setAt(next, path, getAt(latest.current, path)), s));
  }, []);

  /** Starts again from these values (after a save they are the new saved values). */
  const reset = useCallback((next: StudentFormValues) => {
    setValues(next);
    setSaved(next);
    setTouched({});
    setAttempted(false);
    setServerErrors({});
  }, []);

  return {
    values,
    saved,
    dirty,
    problems,
    /** What this school needs; the cards show a box as needed, optional or not at all from it. */
    rules,
    /** The school's own fields (the card of its own shows the ones that are asked). */
    custom: custom ?? [],
    lookups,
    errorOf,
    set,
    touch,
    bind,
    revert,
    setGuardian,
    setMobile,
    lookUp,
    addGuardian,
    removeGuardian,
    makePrimary,
    showMatch,
    check,
    reveal,
    focusFirst,
    showServerErrors,
    setServerErrors,
    rebase,
    reset,
    setRelation: (index: number, relation: Relation) => setGuardian(index, { relation }),
  };
}

export type StudentForm = ReturnType<typeof useStudentForm>;
