import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

/**
 * Who takes a lesson on one day when its teacher is away (2026-11-22, user: "teacher absent ho to arrangement"): the lesson is a period of a
 * class's timetable on that weekday (class, section, period, subject, the teacher it names), the day is a date, and `substituteTeacherId` is the
 * teacher the school put in for that day only. The timetable itself is not changed. One substitute per lesson and day.
 */
export interface ISubstitution {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  /** "2026-11-22": the calendar day in India. */
  date: string;
  classId: Types.ObjectId;
  sectionId: Types.ObjectId | null;
  /** The period of that day (1 is the first). */
  period: number;
  subjectId: Types.ObjectId;
  /** The teacher of the lesson, who is away. */
  absentTeacherId: Types.ObjectId;
  substituteTeacherId: Types.ObjectId;
  /**
   * Minutes after midnight (India) when the teacher who was away came and took the rest of this period back (2026-11-24, user: "meena beech mein aa jaye to baaki
   * time wo class le, dev free ho"); null: the substitute had the whole period. The substitute counts as busy only until then.
   */
  handedBackAt: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const substitutionSchema = new Schema<ISubstitution>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    classId: { type: Schema.Types.ObjectId, ref: "SchoolClass", required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", default: null },
    period: { type: Number, required: true, min: 1 },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    absentTeacherId: { type: Schema.Types.ObjectId, ref: "Teacher", required: true },
    substituteTeacherId: { type: Schema.Types.ObjectId, ref: "Teacher", required: true },
    handedBackAt: { type: Number, default: null, min: 0, max: 24 * 60 },
  },
  { timestamps: true }
);

substitutionSchema.plugin(tenantScope);
substitutionSchema.index({ tenantId: 1, date: 1, classId: 1, sectionId: 1, period: 1, absentTeacherId: 1 }, { unique: true, name: "one_substitute_per_lesson_and_day" });

export const Substitution = model<ISubstitution>("Substitution", substitutionSchema);
