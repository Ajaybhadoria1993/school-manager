import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { indiaNow } from "../../../utils/clock";
import { SchoolClass } from "../../academics/models/SchoolClass";
import { Teacher } from "../../staff/models/Teacher";
import { Allotment } from "../../subjects/models/Allotment";
import { Subject } from "../../subjects/models/Subject";
import { sectionedName, shownUnits } from "../../timetable/services/unit";
import { DiaryEntry, Syllabus } from "../models/ClassWork";
import type { ProgressLogQuery, ProgressQuery } from "../schemas/classroom.schemas";
import { classTeacherUnits, sameUnit, teacherOfUser, worksOnAllClasses } from "./access";
import { fromDay, toDay } from "./calendar.service";
import { currentChapter, isLate, numberedChapter, plannedDay } from "./chapters";
import type { Caller } from "./leave.service";

/** One subject of one class (or section): what the rows of teaching progress are about. */
interface Row {
  classId: string;
  sectionId: string | null;
  classLabel: string;
  subjectId: string;
  subjectName: string;
  teacherId: string | null;
  teacherName: string | null;
}

const keyOf = (r: { classId: unknown; sectionId?: unknown; subjectId: unknown }) => `${String(r.classId)}:${r.sectionId ? String(r.sectionId) : ""}:${String(r.subjectId)}`;
const unitKey = (r: { classId: unknown; sectionId?: unknown }) => `${String(r.classId)}:${r.sectionId ? String(r.sectionId) : ""}`;
const byName = <T extends { name: string }>(list: T[]) => list.sort((a, b) => a.name.localeCompare(b.name));
const uniqueBy = <T>(list: T[], key: (item: T) => string) => [...new Map(list.map((item) => [key(item), item])).values()];

/**
 * Teaching progress (docs/teaching-progress.md): who taught what, in which class and subject, how far the chapters are and the homework.
 * The school (and staff it allows) sees every class; a teacher the classes they are class teacher of (every subject) and the subjects they
 * teach. The year is the one the screen is about (the running one, or a past one being looked at).
 */
export class ProgressService {
  /** Every subject of every class the caller may see, in the school's class order, and the ones the query asks for among them. */
  private static async scope(tenantId: string, caller: Caller, query: ProgressQuery) {
    const school = new Types.ObjectId(tenantId);
    if (query.classId && !(await SchoolClass.exists({ _id: query.classId, tenantId: school }))) throw ApiError.notFound("Class not found", "CLASS_NOT_FOUND");
    const units = await shownUnits(tenantId);
    if (units.length === 0) return { school, yearId: null, all: [] as Row[], rows: [] as Row[] };
    const yearId = units[0].yearId;
    let allotments = await Allotment.find({ tenantId: school, academicYearId: yearId }).select("classId sectionId subjectId teacherId").lean();

    if (!worksOnAllClasses(caller, "progress.view")) {
      const teacher = caller.role === "teacher" ? await teacherOfUser(tenantId, caller.userId) : null;
      const heads = teacher ? await classTeacherUnits(tenantId, teacher._id) : [];
      allotments = teacher ? allotments.filter((a) => a.teacherId?.equals(teacher._id) || heads.some((h) => sameUnit(h, a))) : [];
    }

    const [subjects, teachers] = await Promise.all([
      Subject.find({ tenantId: school, _id: { $in: allotments.map((a) => a.subjectId) } }).select("name").lean(),
      Teacher.find({ tenantId: school, _id: { $in: allotments.flatMap((a) => a.teacherId ?? []) } }).select("name").lean(),
    ]);
    const subjectName = new Map(subjects.map((s) => [s._id.toString(), s.name]));
    const teacherName = new Map(teachers.map((t) => [t._id.toString(), t.name]));
    const sectionCount = new Map<string, number>();
    for (const u of units) sectionCount.set(u.classId, (sectionCount.get(u.classId) ?? 0) + 1);
    const place = new Map(units.map((u, order) => [unitKey(u), { order, label: sectionedName(u.className, u.sectionName, sectionCount.get(u.classId)!) }]));

    const all = allotments
      .flatMap((a) => {
        const at = place.get(unitKey(a));
        // A class or section the school no longer runs is left out.
        if (!at) return [];
        const teacherId = a.teacherId?.toString() ?? null;
        return {
          order: at.order,
          classId: a.classId.toString(),
          sectionId: a.sectionId?.toString() ?? null,
          classLabel: at.label,
          subjectId: a.subjectId.toString(),
          subjectName: subjectName.get(a.subjectId.toString()) ?? "A subject",
          teacherId,
          teacherName: teacherId ? (teacherName.get(teacherId) ?? null) : null,
        };
      })
      .sort((a, b) => a.order - b.order || a.subjectName.localeCompare(b.subjectName))
      .map(({ order: _order, ...row }) => row);

    const wantedSection = query.sectionId === undefined ? undefined : query.sectionId === "none" ? null : query.sectionId;
    const rows = all.filter(
      (r) =>
        (!query.classId || r.classId === query.classId) &&
        (wantedSection === undefined || r.sectionId === wantedSection) &&
        (!query.subjectId || r.subjectId === query.subjectId) &&
        (!query.teacherId || r.teacherId === query.teacherId)
    );
    return { school, yearId, all, rows };
  }

  /** Each subject of each class: its chapters, the one going on, and the updates and homework of the days asked. */
  static async overview(tenantId: string, caller: Caller, query: ProgressQuery) {
    const { school, yearId, all, rows } = await ProgressService.scope(tenantId, caller, query);
    const options = {
      classes: uniqueBy(all, unitKey).map((r) => ({ classId: r.classId, sectionId: r.sectionId, label: r.classLabel })),
      subjects: byName(uniqueBy(all, (r) => r.subjectId).map((r) => ({ id: r.subjectId, name: r.subjectName }))),
      teachers: byName(uniqueBy(all.filter((r) => r.teacherName), (r) => r.teacherId!).map((r) => ({ id: r.teacherId!, name: r.teacherName! }))),
    };
    const classIds = [...new Set(rows.map((r) => r.classId))].map((id) => new Types.ObjectId(id));
    const match = { tenantId: school, academicYearId: yearId, classId: { $in: classIds } };
    type Key = { classId: Types.ObjectId; sectionId: Types.ObjectId | null; subjectId: Types.ObjectId };
    const unitSubject = { classId: "$classId", sectionId: "$sectionId", subjectId: "$subjectId" };
    const [plans, taught, inRange] = rows.length === 0 || !yearId
      ? [[], [], []]
      : await Promise.all([
          Syllabus.find(match).lean(),
          // The whole year: on how many days each chapter was taught, from when to when.
          DiaryEntry.aggregate<{ _id: Key & { chapterId: Types.ObjectId }; days: number; first: Date; last: Date }>([
            { $match: { ...match, chapterId: { $ne: null } } },
            { $group: { _id: { ...unitSubject, chapterId: "$chapterId" }, days: { $sum: 1 }, first: { $min: "$date" }, last: { $max: "$date" } } },
          ]),
          // The days asked: the updates, those with homework, and the latest of them.
          DiaryEntry.aggregate<{ _id: Key; updates: number; homework: number; date: Date; taught: string; homeworkText: string; chapterId: Types.ObjectId | null }>([
            { $match: { ...match, date: { $gte: fromDay(query.from), $lte: fromDay(query.to) } } },
            { $sort: { date: -1 } },
            {
              $group: {
                _id: unitSubject,
                updates: { $sum: 1 },
                homework: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$homework", ""] } }, 0] }, 1, 0] } },
                date: { $first: "$date" },
                taught: { $first: "$taught" },
                homeworkText: { $first: "$homework" },
                chapterId: { $first: "$chapterId" },
              },
            },
          ]),
        ]);

    const planOf = new Map(plans.map((p) => [keyOf(p), p.chapters]));
    const rangeOf = new Map(inRange.map((g) => [keyOf(g._id), g]));
    const chapterStats = new Map(taught.map((g) => [`${keyOf(g._id)}:${g._id.chapterId.toString()}`, g]));

    const today = indiaNow().date;
    const result = rows.map((row) => {
      const key = keyOf(row);
      const chapters = planOf.get(key) ?? [];
      const range = rangeOf.get(key);
      let latest: { id: string; day: Date } | null = null;
      const list = chapters.map((c, i) => {
        const stat = chapterStats.get(`${key}:${c._id.toString()}`);
        if (stat && (!latest || stat.last > latest.day)) latest = { id: c._id.toString(), day: stat.last };
        return {
          id: c._id.toString(),
          number: i + 1,
          name: c.name,
          done: !!c.completedOn,
          completedOn: c.completedOn ? toDay(c.completedOn) : null,
          days: stat?.days ?? 0,
          startedOn: stat ? toDay(stat.first) : null,
          plannedOn: plannedDay(c),
          late: isLate(c, today),
        };
      });
      const last = latest as { id: string; day: Date } | null;
      const lastChapter = numberedChapter(chapters, range?.chapterId?.toString());
      return {
        ...row,
        chapters: list,
        late: list.filter((c) => c.late).length,
        current: currentChapter(chapters, last?.id),
        updates: range?.updates ?? 0,
        homework: range?.homework ?? 0,
        last: range
          ? { date: toDay(range.date), taught: range.taught, homework: range.homeworkText, chapter: lastChapter ? { number: lastChapter.number, name: lastChapter.chapter.name } : null }
          : null,
      };
    });

    const sum = (value: (r: (typeof result)[number]) => number) => result.reduce((total, r) => total + value(r), 0);
    return {
      options,
      summary: {
        updates: sum((r) => r.updates),
        homework: sum((r) => r.homework),
        chaptersDone: sum((r) => r.chapters.filter((c) => c.done).length),
        chaptersTotal: sum((r) => r.chapters.length),
        withoutUpdate: result.filter((r) => r.updates === 0).length,
        // Class subjects with a chapter past its planned day.
        behind: result.filter((r) => r.late > 0).length,
      },
      rows: result,
    };
  }

  /** The days asked, entry by entry, newest first, in pages. */
  static async log(tenantId: string, caller: Caller, query: ProgressLogQuery) {
    const { page, limit } = query;
    return { ...(await ProgressService.entries(tenantId, caller, query, { skip: (page - 1) * limit, limit })), page, limit };
  }

  /** The entries of the days asked, newest first: how many there are in all, and `limit` of them after the first `skip`. */
  static async entries(tenantId: string, caller: Caller, query: ProgressQuery, window: { skip: number; limit: number }) {
    const { school, yearId, rows } = await ProgressService.scope(tenantId, caller, query);
    if (rows.length === 0 || !yearId) return { items: [], total: 0 };
    const filter = {
      tenantId: school,
      academicYearId: yearId,
      date: { $gte: fromDay(query.from), $lte: fromDay(query.to) },
      $or: rows.map((r) => ({ classId: new Types.ObjectId(r.classId), sectionId: r.sectionId ? new Types.ObjectId(r.sectionId) : null, subjectId: new Types.ObjectId(r.subjectId) })),
    };
    const [total, entries] = await Promise.all([
      DiaryEntry.countDocuments(filter),
      DiaryEntry.find(filter)
        .sort({ date: -1, updatedAt: -1, _id: -1 })
        .skip(window.skip)
        .limit(window.limit)
        .lean(),
    ]);
    const plans = await Syllabus.find({ tenantId: school, academicYearId: yearId, classId: { $in: entries.map((e) => e.classId) } }).lean();
    const planOf = new Map(plans.map((p) => [keyOf(p), p.chapters]));
    const rowOf = new Map(rows.map((r) => [keyOf(r), r]));
    return {
      total,
      items: entries.map((e) => {
        const row = rowOf.get(keyOf(e))!;
        const chapter = numberedChapter(planOf.get(keyOf(e)), e.chapterId?.toString());
        return {
          id: e._id.toString(),
          date: toDay(e.date),
          classId: row.classId,
          sectionId: row.sectionId,
          classLabel: row.classLabel,
          subjectName: row.subjectName,
          teacherName: row.teacherName,
          writtenBy: e.writtenBy.name,
          chapter: chapter ? { number: chapter.number, name: chapter.chapter.name } : null,
          taught: e.taught,
          homework: e.homework,
        };
      }),
    };
  }
}
