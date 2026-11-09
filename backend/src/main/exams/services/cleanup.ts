import { Types } from "mongoose";
import { ExamMark } from "../models/ExamMark";
import { ExamPaper } from "../models/ExamPaper";

/**
 * What goes when a class is deleted (a class with students, now or in any year, cannot be): an exam's papers are an arrangement, not
 * history. The class is taken off every paper it was in, its children's marks in those papers go with it, and a paper left with no class goes.
 */
export class ExamCleanup {
  static async forClass(tenantId: string, classId: string): Promise<void> {
    const school = new Types.ObjectId(tenantId);
    const klass = new Types.ObjectId(classId);
    await ExamMark.deleteMany({ tenantId: school, classId: klass });
    await ExamPaper.updateMany({ tenantId: school, classIds: klass }, { $pull: { classIds: klass } });
    await ExamPaper.deleteMany({ tenantId: school, classIds: { $size: 0 } });
  }
}
