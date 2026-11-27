import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { MAX_DUTY_TEACHERS, MAX_ROOM } from "../constants";

/**
 * Who watches a room for an exam (2026-11-27, the user: "kis room mein kaun sa teacher rahega, duty rahegi; ek room mein 1 ya 2 teacher"): one or
 * two teachers, for the whole exam. A room is the name its runs of roll numbers share (`ExamRoom.room`), matched without the case of its letters
 * (`roomKey`); one duty per room of an exam, and a teacher watches one room of an exam. The duty follows its room: renamed with its last run it
 * moves, taken away with its last run it goes, and it goes with the exam.
 */
export interface IExamDuty {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  examId: Types.ObjectId;
  /** The room as it was last named. */
  room: string;
  /** The room's name in small letters with single spaces: "room 101". */
  roomKey: string;
  teacherIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

/** "  Room  101 " -> "room 101": the same room whatever its case and spaces. */
export const roomKeyOf = (room: string) => room.trim().toLowerCase().replace(/\s+/g, " ");

const examDutySchema = new Schema<IExamDuty>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    examId: { type: Schema.Types.ObjectId, ref: "Exam", required: true },
    room: { type: String, required: true, trim: true, maxlength: MAX_ROOM },
    roomKey: { type: String, required: true, maxlength: MAX_ROOM },
    teacherIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Teacher" }],
      validate: { validator: (ids: Types.ObjectId[]) => ids.length >= 1 && ids.length <= MAX_DUTY_TEACHERS, message: `1 to ${MAX_DUTY_TEACHERS} teachers` },
    },
  },
  { timestamps: true }
);

examDutySchema.plugin(tenantScope);
examDutySchema.index({ tenantId: 1, examId: 1, roomKey: 1 }, { unique: true });
// A teacher's own duties (their home).
examDutySchema.index({ tenantId: 1, teacherIds: 1 });

export const ExamDuty = model<IExamDuty>("ExamDuty", examDutySchema);
