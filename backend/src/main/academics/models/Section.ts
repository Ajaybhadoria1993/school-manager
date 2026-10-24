import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

/**
 * A group of students of one class that sits together: "A", "B", or a stream such as "Science" in
 * classes 11 and 12. `tenantId` is kept here too, so a section can never be reached from another school.
 * A section belongs to one academic year: Class 5 exists every year, but next year it may have three sections
 * instead of two, and last year's sections (with the students enrolled in them) must stay as they were.
 * The class teacher is not here yet: it is added when staff exist.
 */
export interface ISection {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  classId: Types.ObjectId;
  /**
   * The session this section is for. null only for a section made by a school that had no academic year yet (approved
   * before academic years existed); it is given the school's first active year as soon as there is one.
   */
  academicYearId: Types.ObjectId | null;
  name: string;
  /** Lower-cased, trimmed name: "a" and "A" are the same section of a class. */
  nameKey: string;
  /** The most students the section should have (admissions will warn at this number). */
  capacity: number | null;
  /** Where it sits: "Room 12", "First floor". */
  room: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const sectionSchema = new Schema<ISection>(
  {
    classId: { type: Schema.Types.ObjectId, ref: "SchoolClass", required: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", default: null },
    name: { type: String, required: true, trim: true, maxlength: 20 },
    nameKey: { type: String, required: true },
    capacity: { type: Number, default: null, min: 1 },
    room: { type: String, default: null, trim: true, maxlength: 30 },
  },
  { timestamps: true }
);

// Adds `tenantId` and refuses any query that does not filter by it (see tenantScope.ts).
sectionSchema.plugin(tenantScope);
// One "A" per class per academic year (next year's Class 5 may have its own "A"). This replaced the older
// { classId, nameKey } index: `npm run migrate:academic-years` drops that one from an existing database.
sectionSchema.index({ classId: 1, academicYearId: 1, nameKey: 1 }, { unique: true, name: "one_section_name_per_class_and_year" });
sectionSchema.index({ tenantId: 1, academicYearId: 1 });

export const Section = model<ISection>("Section", sectionSchema);
