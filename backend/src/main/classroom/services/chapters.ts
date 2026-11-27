import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { indiaNow } from "../../../utils/clock";
import { DiaryEntry, type IChapter } from "../models/ClassWork";
import { toDay } from "./calendar.service";

/** The rules about a subject's chapters that the diary, the parent's page and teaching progress share (docs/teaching-progress.md). */

export const CHAPTER_NOT_FOUND = () => ApiError.notFound("This chapter is not one of the subject's chapters.", "CHAPTER_NOT_FOUND");

export const plannedDay = (c: Pick<IChapter, "plannedOn">) => (c.plannedOn ? toDay(c.plannedOn) : null);

/** Late: its planned day is gone (the day itself is still in time) and it is not finished. */
export const isLate = (c: Pick<IChapter, "plannedOn" | "completedOn">, today = indiaNow().date) => !c.completedOn && !!c.plannedOn && toDay(c.plannedOn) < today;

export const chapterDto = (c: IChapter) => ({ id: c._id.toString(), name: c.name, done: !!c.completedOn, plannedOn: plannedDay(c), late: isLate(c) });

/** A chapter with its place in the list (1 is the first), or null: none named, or one that is not in the list. */
export function numberedChapter(chapters: IChapter[] | undefined, id: string | null | undefined): { number: number; chapter: IChapter } | null {
  const at = id ? (chapters ?? []).findIndex((c) => c._id.toString() === id) : -1;
  return at < 0 ? null : { number: at + 1, chapter: chapters![at] };
}

/** "Chapter 2: Fractions". */
export const chapterText = (found: { number: number; chapter: IChapter }) => `Chapter ${found.number}: ${found.chapter.name}`;

/** The chapter going on: the one taught last, while it is not finished. */
export function currentChapter(chapters: IChapter[], lastTaughtId: string | null | undefined): { number: number; name: string } | null {
  const found = numberedChapter(chapters, lastTaughtId);
  return found && !found.chapter.completedOn ? { number: found.number, name: found.chapter.name } : null;
}

/** For one class (or section) of a year: how many chapters each subject has, how many are finished and the one going on. */
export async function syllabusProgress(
  unit: { tenantId: Types.ObjectId; classId: Types.ObjectId; sectionId: Types.ObjectId | null; academicYearId: Types.ObjectId },
  plans: { subjectId: Types.ObjectId; chapters: IChapter[] }[]
) {
  const withChapters = plans.filter((p) => p.chapters.length > 0);
  if (withChapters.length === 0) return [];
  const latest = await DiaryEntry.aggregate<{ _id: Types.ObjectId; chapterId: Types.ObjectId }>([
    { $match: { ...unit, chapterId: { $ne: null } } },
    { $sort: { date: -1 } },
    { $group: { _id: "$subjectId", chapterId: { $first: "$chapterId" } } },
  ]);
  const lastTaught = new Map(latest.map((l) => [l._id.toString(), l.chapterId.toString()]));
  return withChapters.map((p) => ({
    subjectId: p.subjectId,
    total: p.chapters.length,
    done: p.chapters.filter((c) => c.completedOn).length,
    current: currentChapter(p.chapters, lastTaught.get(p.subjectId.toString())),
  }));
}
