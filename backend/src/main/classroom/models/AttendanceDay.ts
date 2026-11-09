import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

export const ATTENDANCE_STATUSES = ["present", "absent", "late", "leave"] as const;
/** Why a child was absent or late ("Fever"): the teacher may say, up to this many letters. */
export const MAX_REASON = 200;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/**
 * One day's attendance of a section (or a class without sections) (docs/parent-teacher-flow.md, phase 3): each child's mark, who took it.
 * One record per class, section and day; saving the day again replaces its marks.
 */
export interface IAttendanceDay {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  classId: Types.ObjectId;
  sectionId: Types.ObjectId | null;
  date: Date;
  marks: { studentId: Types.ObjectId; status: AttendanceStatus; reason?: string | null }[];
  markedBy: { name: string; role: string };
  createdAt: Date;
  updatedAt: Date;
}

const attendanceDaySchema = new Schema<IAttendanceDay>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "SchoolClass", required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", default: null },
    date: { type: Date, required: true },
    marks: {
      type: [new Schema({ studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true }, status: { type: String, enum: ATTENDANCE_STATUSES, required: true }, reason: { type: String, default: null, trim: true, maxlength: MAX_REASON } }, { _id: false })],
      default: [],
    },
    markedBy: { type: new Schema({ name: String, role: String }, { _id: false }), required: true },
  },
  { timestamps: true }
);

attendanceDaySchema.plugin(tenantScope);
attendanceDaySchema.index({ tenantId: 1, classId: 1, sectionId: 1, date: 1 }, { unique: true, name: "one_attendance_per_unit_day" });
attendanceDaySchema.index({ tenantId: 1, "marks.studentId": 1, date: 1 });

export const AttendanceDay = model<IAttendanceDay>("AttendanceDay", attendanceDaySchema);
