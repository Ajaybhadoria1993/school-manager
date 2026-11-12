import { Types } from "mongoose";
import { Allotment } from "../../subjects/models/Allotment";
import { Timetable } from "../models/Timetable";

/**
 * What goes when a section is deleted (a section with no student in it). What a section studies and its timetable are arrangements, not
 * history (the students, their attendance and marks are what history is, and those keep a section from being deleted at all), so they go with it.
 *
 * A class and a department are never deleted: they are made inactive, and everything of theirs (what the class studies, its timetables,
 * its place in the timings, its exam papers and marks, a department's own timing) is kept for when they are made active again.
 */
export class TimetableCleanup {
  /** A section's subject list and timetable. */
  static async forSection(tenantId: string, sectionId: string): Promise<void> {
    const filter = { tenantId: new Types.ObjectId(tenantId), sectionId: new Types.ObjectId(sectionId) };
    await Promise.all([Allotment.deleteMany(filter), Timetable.deleteMany(filter)]);
  }
}
