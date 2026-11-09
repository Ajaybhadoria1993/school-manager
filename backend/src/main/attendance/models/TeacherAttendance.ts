import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

export const TEACHER_MARKS = ["present", "absent", "leave"] as const;
export type TeacherMark = (typeof TEACHER_MARKS)[number];
export const MAX_NOTE = 300;

/**
 * A teacher's mark for one day (2026-11-06). Usually the teacher marked themselves present in the app, at this moment. The school may also
 * mark or correct the day (a teacher forgot, the phone was dead, the teacher has no login, a teacher is on leave): Present with a time,
 * Absent, or Leave, with a note. A day with no record is worked out (`TeacherAttendanceService`): absent once school has ended, so nothing
 * has to run at the end of the day. `log` is the history of the day as it happened (who marked what, when, why), so the school can look back.
 */
export interface ITeacherAttendance {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  teacherId: Types.ObjectId;
  /** The day, as midnight UTC of the Indian calendar day. */
  date: Date;
  /** What the day is: Present (they came), Absent (the school says they did not), Leave. */
  mark: TeacherMark;
  /** The very moment a teacher came (Present only); null for Absent and Leave. */
  checkedInAt: Date | null;
  /** Minutes after the school's start time when they came (0: in time); null when not Present, or the school's start time is not known. */
  lateByMinutes: number | null;
  /** Who made the day's mark: the teacher themselves, or the school. */
  source: "self" | "school";
  /** The school's latest note (why a day was marked so). */
  note: string | null;
  log: { at: Date; action: "checked_in" | "marked_by_school"; status: TeacherMark; by: { name: string; role: string }; note: string | null }[];
  createdAt: Date;
  updatedAt: Date;
}

const teacherAttendanceSchema = new Schema<ITeacherAttendance>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "Teacher", required: true },
    date: { type: Date, required: true },
    mark: { type: String, enum: TEACHER_MARKS, default: "present", required: true },
    checkedInAt: { type: Date, default: null },
    lateByMinutes: { type: Number, default: null, min: 0 },
    source: { type: String, enum: ["self", "school"], default: "self", required: true },
    note: { type: String, default: null, maxlength: MAX_NOTE },
    log: {
      type: [
        new Schema(
          {
            at: { type: Date, required: true },
            action: { type: String, enum: ["checked_in", "marked_by_school"], required: true },
            status: { type: String, enum: TEACHER_MARKS, default: "present" },
            by: { type: new Schema({ name: String, role: String }, { _id: false }), required: true },
            note: { type: String, default: null, maxlength: MAX_NOTE },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { timestamps: true }
);

teacherAttendanceSchema.plugin(tenantScope);
// One mark per teacher per day: a second tap is the same mark.
teacherAttendanceSchema.index({ tenantId: 1, teacherId: 1, date: 1 }, { unique: true, name: "one_mark_per_teacher_and_day" });
// The school's sheet reads a range of days.
teacherAttendanceSchema.index({ tenantId: 1, date: 1 });

export const TeacherAttendance = model<ITeacherAttendance>("TeacherAttendance", teacherAttendanceSchema);
