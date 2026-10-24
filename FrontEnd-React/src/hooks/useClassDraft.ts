import { useEffect, useState } from "react";
import { MAX_SECTION_CAPACITY } from "../constants/academics";
import type { ClassItem, SectionInput, SectionItem } from "../types";

const tidy = (text: string) => text.trim().replace(/\s+/g, " ");

export type SectionField = "name" | "seats" | "room";

/** What a section's three boxes show. */
export interface SectionValues {
  name: string;
  seats: string;
  room: string;
}

/** What is wrong with a section, to show under its boxes. */
export interface SectionProblems {
  name?: string;
  seats?: string;
  room?: string;
  /** From the server (a name already used...), for the whole card. */
  form?: string;
}

/** The two things the draft saves; each returns what is wrong, or nothing when it worked. */
export interface DraftSaver {
  renameClass: (name: string) => Promise<string | void>;
  saveSection: (section: SectionItem, changes: Partial<SectionInput>) => Promise<string | void>;
}

const CLASS_NAME = "class";
const ALL = "_all";
const keyOf = (section: SectionItem, field: SectionField | "form") => `${section.id}:${field}`;
const seatsOf = (s: SectionItem) => (s.capacity != null ? String(s.capacity) : "");
const roomOf = (s: SectionItem) => s.room ?? "";

/** The text of a box as the server would store it: names are tidied, seats and room trimmed. */
const normalize = (key: string, text: string) => (key === CLASS_NAME || key.endsWith(":name") ? tidy(text) : text.trim());

/**
 * Everything typed on a class's screen that is not saved yet: its name and the name, seats and room of each of its sections.
 * Only the boxes that were typed in are kept (`edits`); every other box shows what the server has, so a refresh from the server
 * never overwrites something being typed and never needs syncing. A box typed back to the saved value is not a change.
 * Nothing is sent while typing: `save` sends one request for the class's name (if it changed) and one for each section that
 * changed (with only its changed boxes), one after another. A box that was saved keeps showing what was saved until the server's
 * answer arrives (`settled`), so it never flashes back to the old value. What failed stays typed, with the reason, so it can be
 * fixed and saved again.
 * When the school requires seats and room (`requireDetails`, the server's rule: see SectionService), a section that is saved with
 * either of them empty is refused here first, with the same words the server would use; the server refuses it anyway.
 */
export function useClassDraft(classItem: ClassItem | undefined, requireDetails: boolean) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  /** Boxes just saved: key -> the value that was saved. Not a change while the box still shows it. */
  const [settled, setSettled] = useState<Record<string, string>>({});
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const sections = classItem?.sections ?? [];

  /** What the server has for a box; undefined for a box of a section that is gone. */
  function savedFor(key: string): string | undefined {
    if (key === CLASS_NAME) return classItem?.name ?? "";
    const [id, field] = key.split(":");
    const section = sections.find((s) => s.id === id);
    if (!section) return undefined;
    return field === "name" ? section.name : field === "seats" ? seatsOf(section) : roomOf(section);
  }
  const isDirty = (key: string) => {
    const text = edits[key];
    if (text === undefined) return false;
    const value = normalize(key, text);
    return value !== savedFor(key) && value !== settled[key];
  };

  // Once the server's answer has arrived, a box that shows what the server has is no longer an edit at all.
  useEffect(() => {
    const same = (key: string, text: string) => normalize(key, text) === savedFor(key);
    setEdits((current) => {
      const kept = Object.entries(current).filter(([key, text]) => !same(key, text));
      return kept.length === Object.keys(current).length ? current : Object.fromEntries(kept);
    });
    setSettled((current) => {
      const kept = Object.entries(current).filter(([key, value]) => value !== savedFor(key));
      return kept.length === Object.keys(current).length ? current : Object.fromEntries(kept);
    });
    // `savedFor` reads classItem; this runs when the server's answer changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classItem]);

  const valueOf = (key: string, saved: string) => edits[key] ?? saved;
  const className = valueOf(CLASS_NAME, classItem?.name ?? "");
  const classNameDirty = isDirty(CLASS_NAME);

  const sectionValues = (s: SectionItem): SectionValues => ({
    name: valueOf(keyOf(s, "name"), s.name),
    seats: valueOf(keyOf(s, "seats"), seatsOf(s)),
    room: valueOf(keyOf(s, "room"), roomOf(s)),
  });
  const changedFields = (s: SectionItem): SectionField[] =>
    (["name", "seats", "room"] as const).filter((field) => isDirty(keyOf(s, field)));
  const sectionDirty = (s: SectionItem) => changedFields(s).length > 0;

  /** How many things are unsaved: the class name, and each section with a changed box. */
  const dirtyCount = (classNameDirty ? 1 : 0) + sections.filter(sectionDirty).length;

  const sectionProblems = (s: SectionItem): SectionProblems => ({
    name: problems[keyOf(s, "name")],
    seats: problems[keyOf(s, "seats")],
    room: problems[keyOf(s, "room")],
    form: problems[keyOf(s, "form")],
  });

  function touch(key: string, text: string) {
    setEdits((current) => ({ ...current, [key]: text }));
    setProblems((current) => {
      const next = { ...current };
      delete next[key];
      delete next[ALL];
      // A new try at a section's boxes clears what the server said about the card.
      if (key !== CLASS_NAME) delete next[`${key.split(":")[0]}:form`];
      return next;
    });
    setSettled((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setJustSaved(false);
  }

  const changeClassName = (text: string) => touch(CLASS_NAME, text);
  const changeSection = (s: SectionItem, field: SectionField, text: string) => touch(keyOf(s, field), text);

  const forget = (match: (key: string) => boolean) => {
    const keep = (current: Record<string, string>) => Object.fromEntries(Object.entries(current).filter(([key]) => !match(key)));
    setEdits(keep);
    setSettled(keep);
    setProblems((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !match(key) && key !== ALL)));
  };
  const revertClassName = () => forget((key) => key === CLASS_NAME);
  const revertSection = (s: SectionItem) => forget((key) => key.startsWith(`${s.id}:`));

  /** Sends what changed. Resolves to true when at least one change was saved (so the caller refreshes what was touched, once). */
  async function save(saver: DraftSaver): Promise<boolean> {
    if (!classItem || saving || dirtyCount === 0) return false;

    // What is wrong can be told before anything is sent.
    const wrong: Record<string, string> = {};
    if (classNameDirty && !tidy(className)) wrong[CLASS_NAME] = "Enter the class name.";
    for (const s of sections) {
      const v = sectionValues(s);
      const changed = changedFields(s);
      if (changed.includes("name") && !tidy(v.name)) wrong[keyOf(s, "name")] = "Enter the section name.";
      const seats = v.seats.trim() === "" ? null : Number(v.seats.trim());
      // A section that is changed must end up with what the school requires, whichever box was changed.
      if (requireDetails && changed.length > 0) {
        if (seats === null) wrong[keyOf(s, "seats")] = "Enter the seats.";
        if (v.room.trim() === "") wrong[keyOf(s, "room")] = "Enter the room.";
      }
      if (changed.includes("seats") && seats !== null && (!Number.isInteger(seats) || seats < 1 || seats > MAX_SECTION_CAPACITY)) {
        wrong[keyOf(s, "seats")] = `Seats must be a whole number from 1 to ${MAX_SECTION_CAPACITY}, or empty.`;
      }
    }
    if (Object.keys(wrong).length > 0) {
      setProblems(wrong);
      return false;
    }

    setSaving(true);
    setProblems({});
    const failed: Record<string, string> = {};
    const done: Record<string, string> = {};

    if (classNameDirty) {
      const problem = await saver.renameClass(tidy(className));
      if (problem) failed[CLASS_NAME] = problem;
      else done[CLASS_NAME] = tidy(className);
    }
    // One request per changed section, in the order they are shown, each with only its changed boxes (so saving the seats can
    // never put back an old room saved a moment ago).
    for (const s of sections) {
      const changed = changedFields(s);
      if (changed.length === 0) continue;
      const v = sectionValues(s);
      const changes: Partial<SectionInput> = {};
      if (changed.includes("name")) changes.name = tidy(v.name);
      if (changed.includes("seats")) changes.capacity = v.seats.trim() === "" ? null : Number(v.seats.trim());
      if (changed.includes("room")) changes.room = v.room.trim() || null;
      const problem = await saver.saveSection(s, changes);
      if (problem) failed[keyOf(s, "form")] = problem;
      else changed.forEach((field) => (done[keyOf(s, field)] = normalize(keyOf(s, field), v[field])));
    }

    setSaving(false);
    setSettled((current) => ({ ...current, ...done }));
    const failures = Object.keys(failed).length;
    if (failures > 0) {
      failed[ALL] = failures === 1 ? "One change could not be saved. It is marked below." : `${failures} changes could not be saved. They are marked below.`;
    }
    setProblems(failed);
    setJustSaved(failures === 0 && Object.keys(done).length > 0);
    return Object.keys(done).length > 0;
  }

  return {
    className,
    classNameDirty,
    classNameProblem: problems[CLASS_NAME],
    sectionValues,
    sectionDirty,
    sectionProblems,
    /** Said about the whole screen after a Save in which something failed. */
    summaryProblem: problems[ALL],
    dirty: dirtyCount > 0,
    saving,
    justSaved,
    changeClassName,
    changeSection,
    revertClassName,
    revertSection,
    save,
  };
}
