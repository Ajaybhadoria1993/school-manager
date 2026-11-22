import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { MAX_NOTE, TEACHER_MARKS, type TeacherMark } from "./TeacherAttendance";

/**
 * A staff member's mark for one day (2026-11-22): the people who work for the school without teaching (a receptionist, an accountant, a peon),
 * in the shape of a teacher's (`TeacherAttendance`): they marked themselves present in the app, at this moment, with their own login. The school
 * only looks (it never marks a staff day); `source`, `note` and the school's log lines are kept for the shape, and for a later way to put a day
 * on leave. A day with no record is worked out (`StaffAttendanceService`): absent once school has ended. `log` is the history of the day.
 */
export interface IStaffAttendance {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  staffMemberId: Types.ObjectId;
  /** The day, as midnight UTC of the Indian calendar day. */
  date: Date;
  mark: TeacherMark;
  /** The very moment they came (Present only); null for Absent and Leave. */
  checkedInAt: Date | null;
  /** Minutes after the school's start time when they came (0: in time); null when not Present, or the start time is not known. */
  lateByMinutes: number | null;
  source: "self" | "school";
  note: string | null;
  log: { at: Date; action: "checked_in" | "marked_by_school"; status: TeacherMark; by: { name: string; role: string }; note: string | null }[];
  createdAt: Date;
  updatedAt: Date;
}

const staffAttendanceSchema = new Schema<IStaffAttendance>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    staffMemberId: { type: Schema.Types.ObjectId, ref: "StaffMember", required: true },
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

staffAttendanceSchema.plugin(tenantScope);
// One mark per staff member per day: a second tap is the same mark.
staffAttendanceSchema.index({ tenantId: 1, staffMemberId: 1, date: 1 }, { unique: true, name: "one_mark_per_staff_member_and_day" });
// The school's sheet reads a range of days.
staffAttendanceSchema.index({ tenantId: 1, date: 1 });

export const StaffAttendance = model<IStaffAttendance>("StaffAttendance", staffAttendanceSchema);
