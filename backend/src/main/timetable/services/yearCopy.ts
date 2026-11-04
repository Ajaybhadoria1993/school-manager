import { Types } from "mongoose";
import { Allotment } from "../../subjects/models/Allotment";
import { Timetable } from "../models/Timetable";

/**
 * A new session starts from the old one's arrangement: what each class studies and its weekly timetable are copied into the next year's
 * sections (as drafts, to look at and publish), because a school's timetable changes little from one year to the next. The old year's
 * records are not touched. `sectionMap` is old section id -> its copy in the new year; a class that has no sections is the same unit in
 * both years.
 */
export async function copyTimetableToYear(
  tenantId: string,
  fromYearId: Types.ObjectId,
  toYearId: Types.ObjectId,
  sectionMap: Map<string, string>
): Promise<{ allotments: number; timetables: number }> {
  const school = new Types.ObjectId(tenantId);
  const target = (sectionId: Types.ObjectId | null): Types.ObjectId | null | undefined => {
    if (!sectionId) return null;
    const copy = sectionMap.get(sectionId.toString());
    return copy ? new Types.ObjectId(copy) : undefined;
  };

  const allotments = await Allotment.find({ tenantId: school, academicYearId: fromYearId }).lean();
  const newAllotments = allotments.flatMap((a) => {
    const sectionId = target(a.sectionId);
    if (sectionId === undefined) return [];
    return [
      {
        tenantId: school,
        academicYearId: toYearId,
        classId: a.classId,
        sectionId,
        subjectId: a.subjectId,
        periodsPerWeek: a.periodsPerWeek,
        blockSize: a.blockSize,
        teacherId: a.teacherId ?? null,
        group: a.group ?? null,
        groupKey: a.groupKey ?? null,
        position: a.position,
      },
    ];
  });
  if (newAllotments.length > 0) await Allotment.insertMany(newAllotments);

  const timetables = await Timetable.find({ tenantId: school, academicYearId: fromYearId }).lean();
  const newTimetables = timetables.flatMap((t) => {
    const sectionId = target(t.sectionId);
    if (sectionId === undefined || t.cells.length === 0) return [];
    return [{ tenantId: school, academicYearId: toYearId, classId: t.classId, sectionId, cells: t.cells, status: "draft" as const }];
  });
  if (newTimetables.length > 0) await Timetable.insertMany(newTimetables);

  return { allotments: newAllotments.length, timetables: newTimetables.length };
}
