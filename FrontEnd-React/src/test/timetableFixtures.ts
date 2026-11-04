import type { AllotmentView, GridView, Schedule, Slot, Subject, Teacher, TeacherWeek, TimetableOverview } from "../types";

/** The school the timetable page tests use: Class 5 with sections A and B, Class 1 with none; the usual day Monday to Friday. */

export const day = (clock: [string, string][], lunchAfter = 3): Slot[] => {
  const slots: Slot[] = [];
  clock.forEach(([start, end], i) => {
    slots.push({ kind: "period", label: "", start, end });
    if (i + 1 === lunchAfter) slots.push({ kind: "lunch", label: "Lunch", start: "10:30", end: "11:00" });
  });
  return slots;
};

export const REGULAR_ROWS = day([
  ["08:30", "09:10"],
  ["09:10", "09:50"],
  ["09:50", "10:30"],
  ["11:00", "11:40"],
  ["11:40", "12:20"],
  ["12:20", "13:00"],
  ["13:00", "13:40"],
  ["13:40", "14:20"],
]);

export const REGULAR: Schedule = { id: "t1", name: "Regular", days: [1, 2, 3, 4, 5], scope: "all", classIds: [], departmentId: null, slots: REGULAR_ROWS, periods: 8 };

export const MATHS: Subject = { id: "maths", name: "Mathematics", code: null, category: "academic", isActive: true, sections: 2 };
export const ENGLISH: Subject = { id: "english", name: "English", code: "ENG", category: "academic", isActive: true, sections: 2 };
export const ART: Subject = { id: "art", name: "Art & Craft", code: null, category: "activity", isActive: true, sections: 0 };

export const MEENA: Teacher = { id: "meena", name: "Meena Singh", mobile: "9876543210", email: null, employeeCode: "T-1", subjectIds: ["maths"], maxPeriodsPerDay: null, maxPeriodsPerWeek: null, offDays: [], isActive: true, load: { sections: 2, periodsAllotted: 12 }, gender: null, dateOfBirth: null, address: { line1: null, city: null, state: null, pincode: null }, designation: null, qualification: null, experienceYears: null, joiningDate: null, employmentType: null, login: null, classTeacherOf: [] };
export const DEV: Teacher = { id: "dev", name: "Dev Patel", mobile: null, email: null, employeeCode: null, subjectIds: [], maxPeriodsPerDay: 5, maxPeriodsPerWeek: null, offDays: [1], isActive: true, load: { sections: 0, periodsAllotted: 0 }, gender: null, dateOfBirth: null, address: { line1: null, city: null, state: null, pincode: null }, designation: null, qualification: null, experienceYears: null, joiningDate: null, employmentType: null, login: null, classTeacherOf: [] };

const unit = { classId: "c5", className: "Class 5", sectionId: "c5-A", sectionName: "A", label: "Class 5 - A", academicYear: { id: "y1", name: "2026-2027" } };

export const OVERVIEW: TimetableOverview = {
  academicYear: { id: "y1", name: "2026-2027" },
  counts: { subjects: 2, teachers: 2, timings: 1 },
  summary: { units: 3, withSubjects: 2, withTiming: 3, none: 1, draft: 1, published: 1 },
  timings: [{ id: "t1", name: "Regular", days: [1, 2, 3, 4, 5], scope: "all", classNames: [], periods: 8, start: "08:30", end: "14:20", lunch: { start: "10:30", end: "11:00" } }],
  units: [
    { classId: "c5", sectionId: "c5-A", label: "Class 5 - A", className: "Class 5", hasTiming: true, subjects: 2, periodsToPlace: 11, periodsAvailable: 40, withoutTeacher: 1, status: "draft", filled: 7, total: 40, errors: 0, warnings: 2 },
    { classId: "c5", sectionId: "c5-B", label: "Class 5 - B", className: "Class 5", hasTiming: true, subjects: 2, periodsToPlace: 11, periodsAvailable: 40, withoutTeacher: 0, status: "published", filled: 11, total: 40, errors: 0, warnings: 0 },
    { classId: "c1", sectionId: null, label: "Class 1", className: "Class 1", hasTiming: true, subjects: 0, periodsToPlace: 0, periodsAvailable: 40, withoutTeacher: 0, status: "none", filled: 0, total: 40, errors: 0, warnings: 0 },
  ],
};

export const ALLOTMENT: AllotmentView = {
  unit,
  rows: [
    { subjectId: "maths", subjectName: "Mathematics", subjectCode: null, category: "academic", subjectActive: true, periodsPerWeek: 6, blockSize: 1, teacherId: "meena", teacherName: "Meena Singh", group: null },
    { subjectId: "english", subjectName: "English", subjectCode: "ENG", category: "academic", subjectActive: true, periodsPerWeek: 5, blockSize: 1, teacherId: null, teacherName: null, group: null },
  ],
  siblings: [{ id: "c5-B", name: "B" }],
  totals: { periods: 11, available: 40 },
};

/** The empty grid of Class 5 - A: five days with the usual rows, Maths (Meena) 6 and English (no teacher) 5. */
export const GRID: GridView = {
  unit,
  exists: false,
  status: "draft",
  publishedAt: null,
  updatedAt: null,
  days: [1, 2, 3, 4, 5].map((d) => {
    let n = 0;
    return {
      day: d,
      name: ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"][d],
      slots: REGULAR_ROWS.map((s) => ({ ...s, label: s.kind === "period" ? `Period ${(n += 1)}` : s.label, period: s.kind === "period" ? n : null })),
    };
  }),
  cells: [],
  allotments: [
    { subjectId: "maths", subjectName: "Mathematics", subjectCode: null, category: "academic", periodsPerWeek: 6, blockSize: 1, teacherId: "meena", group: null },
    { subjectId: "english", subjectName: "English", subjectCode: "ENG", category: "academic", periodsPerWeek: 5, blockSize: 1, teacherId: null, group: null },
  ],
  teachers: [
    { id: "dev", name: "Dev Patel", isActive: true, offDays: [1], maxPerDay: 5, maxPerWeek: null, subjectIds: [] },
    { id: "meena", name: "Meena Singh", isActive: true, offDays: [], maxPerDay: null, maxPerWeek: null, subjectIds: ["maths"] },
  ],
  busy: [],
  load: [],
  issues: [
    { level: "warning", code: "TOO_FEW", message: "Mathematics has none of its 6 periods", subjectId: "maths" },
    { level: "warning", code: "TOO_FEW", message: "English has none of its 5 periods", subjectId: "english" },
  ],
  stats: { total: 40, filled: 0, free: 40, placed: {} },
};

export const WEEK: TeacherWeek = {
  teacher: { id: "meena", name: "Meena Singh", isActive: true, offDays: [], maxPerDay: 6, maxPerWeek: 30 },
  lessons: [
    { day: 1, period: 1, start: "08:30", end: "09:10", classId: "c5", sectionId: "c5-A", label: "Class 5 - A", subjectId: "maths", subjectName: "Mathematics", room: null, published: true },
    { day: 1, period: 4, start: "11:00", end: "11:40", classId: "c5", sectionId: "c5-B", label: "Class 5 - B", subjectId: "maths", subjectName: "Mathematics", room: "Room 5B", published: false },
  ],
  teaches: [{ classId: "c5", sectionId: "c5-A", label: "Class 5 - A", subjectId: "maths", subjectName: "Mathematics", periodsPerWeek: 6 }],
  perDay: { "1": 2 },
  week: 2,
};
