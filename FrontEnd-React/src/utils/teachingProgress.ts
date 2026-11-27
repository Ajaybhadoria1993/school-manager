import { MAX_CHAPTERS } from "../constants/classwork";
import type { ChapterDraft, ChapterSource, ProgressRow } from "../types";
import { clock12 } from "./exams";

/** The query of a class chosen in the filter, written "classId:sectionId" ("classId:none" for a class without sections). */
export const classKey = (c: { classId: string; sectionId: string | null }) => `${c.classId}:${c.sectionId ?? "none"}`;

/** What one teacher did: their class subjects together. */
export interface TeacherTotals {
  teacherId: string;
  name: string;
  subjects: number;
  updates: number;
  homework: number;
  chaptersDone: number;
  chaptersTotal: number;
  /** Chapters past their planned day. */
  late: number;
  withoutUpdate: number;
}

/** The rows added up by teacher, by name; a subject with no teacher belongs to nobody. */
export function byTeacher(rows: ProgressRow[]): TeacherTotals[] {
  const totals = new Map<string, TeacherTotals>();
  for (const r of rows) {
    if (!r.teacherId || !r.teacherName) continue;
    const t = totals.get(r.teacherId) ?? { teacherId: r.teacherId, name: r.teacherName, subjects: 0, updates: 0, homework: 0, chaptersDone: 0, chaptersTotal: 0, late: 0, withoutUpdate: 0 };
    t.subjects += 1;
    t.updates += r.updates;
    t.homework += r.homework;
    t.chaptersDone += r.chapters.filter((c) => c.done).length;
    t.chaptersTotal += r.chapters.length;
    t.late += r.late;
    t.withoutUpdate += r.updates === 0 ? 1 : 0;
    totals.set(r.teacherId, t);
  }
  return [...totals.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The chapters of another list added after the ones in the window: a name already there (whatever its capitals) is not added again, rows
 * still wholly empty make way, and the list stops at the most a subject has.
 */
export function copyChapters(rows: ChapterDraft[], source: ChapterSource["chapters"]): ChapterDraft[] {
  const kept = rows.filter((r) => r.id || r.name.trim() || r.plannedOn || r.done);
  const names = new Set(kept.map((r) => r.name.trim().toLowerCase()));
  let key = rows.reduce((top, r) => Math.max(top, r.key + 1), 0);
  const added: ChapterDraft[] = [];
  for (const chapter of source) {
    const name = chapter.name.trim().toLowerCase();
    if (names.has(name)) continue;
    names.add(name);
    added.push({ key: key++, name: chapter.name, done: false, plannedOn: chapter.plannedOn ?? "" });
  }
  return [...kept, ...added].slice(0, MAX_CHAPTERS);
}

/** The times a reminder can go: every half hour from noon to 9 PM, with the saved one in its place when it is between them. */
export function reminderTimes(saved: string): { value: string; label: string }[] {
  const halves = Array.from({ length: 19 }, (_, i) => `${String(12 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 === 0 ? "00" : "30"}`);
  return [...new Set([...halves, saved])].sort().map((value) => ({ value, label: clock12(value) }));
}
