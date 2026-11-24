import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

/**
 * Who takes a class's student attendance on one day when its class teacher is away (2026-11-24, user: "class teacher absent ho to us class ki student
 * attendance koi nahi le sakta: agar class teacher hai to ye attendance kisi aur teacher ko assign kar do jo pehla period le"). Only the class teacher
 * takes a class's attendance, so on a day she is away nobody could. The school (Leave & arrangements) names one other teacher, one who takes a period of that
 * class that day, and that teacher takes the attendance of that class **on that day only**; the class teacher is not changed. One per class (or section) and day.
 */
export interface IAttendanceCover {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  /** "2026-11-24": the calendar day in India. */
  date: string;
  classId: Types.ObjectId;
  sectionId: Types.ObjectId | null;
  /** The class teacher, who is away. */
  absentTeacherId: Types.ObjectId;
  /** The teacher who takes the attendance that day. */
  coverTeacherId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const attendanceCoverSchema = new Schema<IAttendanceCover>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    classId: { type: Schema.Types.ObjectId, ref: "SchoolClass", required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", default: null },
    absentTeacherId: { type: Schema.Types.ObjectId, ref: "Teacher", required: true },
    coverTeacherId: { type: Schema.Types.ObjectId, ref: "Teacher", required: true },
  },
  { timestamps: true }
);

attendanceCoverSchema.plugin(tenantScope);
attendanceCoverSchema.index({ tenantId: 1, date: 1, classId: 1, sectionId: 1 }, { unique: true, name: "one_attendance_cover_per_class_and_day" });
attendanceCoverSchema.index({ tenantId: 1, coverTeacherId: 1, date: 1 });

export const AttendanceCover = model<IAttendanceCover>("AttendanceCover", attendanceCoverSchema);
