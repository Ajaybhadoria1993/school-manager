import { Types } from "mongoose";
import { Allotment } from "../../subjects/models/Allotment";
import { BellSchedule } from "../models/BellSchedule";
import { Timetable } from "../models/Timetable";

/**
 * What goes when a section or a class is deleted. What a class studies and its timetable are arrangements, not history (the students,
 * their attendance and marks are what history is, and those keep a section or class from being deleted at all), so they go with it.
 */
export class TimetableCleanup {
  /** A section's subject list and timetable. */
  static async forSection(tenantId: string, sectionId: string): Promise<void> {
    const filter = { tenantId: new Types.ObjectId(tenantId), sectionId: new Types.ObjectId(sectionId) };
    await Promise.all([Allotment.deleteMany(filter), Timetable.deleteMany(filter)]);
  }

  /**
   * A class's subject lists and timetables (every year's), and the class taken out of the timings that name it: a timing made only for
   * this class (and for no other) goes too, since it would be for nobody.
   */
  static async forClass(tenantId: string, classId: string): Promise<void> {
    const school = new Types.ObjectId(tenantId);
    const klass = new Types.ObjectId(classId);
    await Promise.all([Allotment.deleteMany({ tenantId: school, classId: klass }), Timetable.deleteMany({ tenantId: school, classId: klass })]);
    await BellSchedule.updateMany({ tenantId: school, classIds: klass }, { $pull: { classIds: klass } });
    // A department's timing names no class (it follows the department's), so it is never "for nobody" here.
    await BellSchedule.deleteMany({ tenantId: school, scope: "only", classIds: { $size: 0 }, departmentId: null });
    // "All but these classes" with none left to leave out is "all".
    await BellSchedule.updateMany({ tenantId: school, scope: "except", classIds: { $size: 0 } }, { $set: { scope: "all" } });
  }

  /** A department's own timings go with it: its classes, now in no department, follow the school's timing. */
  static async forDepartment(tenantId: string, departmentId: string): Promise<void> {
    await BellSchedule.deleteMany({ tenantId: new Types.ObjectId(tenantId), departmentId: new Types.ObjectId(departmentId) });
  }
}
