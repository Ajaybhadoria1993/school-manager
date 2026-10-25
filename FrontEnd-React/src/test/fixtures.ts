import { DEFAULT_FIELD_RULES } from "../constants/studentFields";
import type { AcademicStructure, StudentCapacity, StudentSettings } from "../types";
import { defaultLayout } from "../utils/exportLayout";

/** A school with Class 1 (no sections) and Class 6 (section A, 30 seats). */
export const STRUCTURE: AcademicStructure = {
  academicYear: { id: "y1", name: "2026-2027" },
  settings: { sectionDetailsRequired: false },
  departments: [],
  classes: [
    { id: "c1", name: "Class 1", order: 1, departmentId: null, sections: [] },
    { id: "c6", name: "Class 6", order: 6, departmentId: null, sections: [{ id: "c6-A", classId: "c6", name: "A", capacity: 30, room: null }] },
  ],
  totals: { departments: 0, classes: 2, sections: 1, seats: 30 },
};

/** The same school with nobody admitted yet. */
export const CAPACITY: StudentCapacity = {
  academicYear: { id: "y1", name: "2026-2027" },
  sections: [{ sectionId: "c6-A", classId: "c6", capacity: 30, enrolled: 0, seatsLeft: 30, nextRollNumber: 1 }],
  classes: [],
  totals: { students: 0, seats: 30, seatsLeft: 30, fullSections: 0 },
};

/** A new school's settings: the default needs and the default Excel layout. */
export const SETTINGS: StudentSettings = { fields: DEFAULT_FIELD_RULES, customFields: [], exportColumns: defaultLayout(), exportIsDefault: true, updatedAt: null };
