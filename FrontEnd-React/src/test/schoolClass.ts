import type { AcademicStructure, ClassOverview, ClassOverviewPage, StudentPage, StudentRow } from "../types";

/** Primary (Class 1 without sections, Class 5 with A and B), Middle (Class 6 with A) and Class 9 in no department. */
export const STRUCTURE: AcademicStructure = {
  academicYear: { id: "y1", name: "2026-2027" },
  settings: { sectionDetailsRequired: false },
  departments: [
    { id: "d1", name: "Primary", classCount: 2 },
    { id: "d2", name: "Middle", classCount: 1 },
  ],
  classes: [
    { id: "c1", name: "Class 1", order: 1, departmentId: "d1", capacity: null, sections: [] },
    {
      id: "c5",
      name: "Class 5",
      order: 5,
      departmentId: "d1",
      capacity: null,
      sections: [
        { id: "c5-A", classId: "c5", name: "A", capacity: 40, room: "Room 5A" },
        { id: "c5-B", classId: "c5", name: "B", capacity: 2, room: null },
      ],
    },
    { id: "c6", name: "Class 6", order: 6, departmentId: "d2", capacity: null, sections: [{ id: "c6-A", classId: "c6", name: "A", capacity: 30, room: null }] },
    { id: "c9", name: "Class 9", order: 9, departmentId: null, capacity: null, sections: [] },
  ],
  totals: { departments: 2, classes: 4, sections: 3, seats: 72 },
};

export const CLASSES: ClassOverview[] = [
  { id: "c1", name: "Class 1", departmentId: "d1", departmentName: "Primary", students: 1, seats: 0, seatsLeft: 0, percent: 0, sections: [], classTeacher: null },
  {
    id: "c5",
    name: "Class 5",
    departmentId: "d1",
    departmentName: "Primary",
    students: 22,
    seats: 42,
    seatsLeft: 20,
    percent: 52,
    classTeacher: null,
    sections: [
      { id: "c5-A", name: "A", room: "Room 5A", capacity: 40, enrolled: 20, seatsLeft: 20, state: "open", percent: 50, classTeacher: null },
      { id: "c5-B", name: "B", room: null, capacity: 2, enrolled: 2, seatsLeft: 0, state: "full", percent: 100, classTeacher: null },
    ],
  },
  {
    id: "c6",
    name: "Class 6",
    departmentId: "d2",
    departmentName: "Middle",
    students: 0,
    seats: 30,
    seatsLeft: 30,
    percent: 0,
    classTeacher: null,
    sections: [{ id: "c6-A", name: "A", room: null, capacity: 30, enrolled: 0, seatsLeft: 30, state: "open", percent: 0, classTeacher: null }],
  },
  { id: "c9", name: "Class 9", departmentId: null, departmentName: null, students: 0, seats: 0, seatsLeft: 0, percent: 0, sections: [], classTeacher: null },
];

/** What the server answers to `GET /students/class-overview`: the classes the filter in the address keeps (as the real one filters). */
export function classOverviewFor(query: URLSearchParams, classes: ClassOverview[] = CLASSES): ClassOverviewPage {
  const department = query.get("departmentId");
  const words = (query.get("q") ?? "").toLowerCase().replace(/s+/g, " ").trim();
  const kept = classes.filter(
    (c) =>
      (!query.get("classId") || c.id === query.get("classId")) &&
      (!words || c.name.toLowerCase().includes(words)) &&
      (!department || (department === "none" ? !c.departmentId : c.departmentId === department))
  );
  const sections = kept.flatMap((c) => c.sections);
  return {
    academicYear: { id: "y1", name: "2026-2027" },
    departments: STRUCTURE.departments.map((d) => ({ id: d.id, name: d.name })),
    summary: {
      classes: kept.length,
      sections: sections.length,
      students: kept.reduce((sum, c) => sum + c.students, 0),
      seats: kept.reduce((sum, c) => sum + c.seats, 0),
      seatsLeft: kept.reduce((sum, c) => sum + c.seatsLeft, 0),
      fullSections: sections.filter((s) => s.state === "full").length,
    },
    classes: kept,
  };
}

const student = (id: string, name: string, classId: string, className: string, sectionName: string | null, gender: "Male" | "Female" = "Female"): StudentRow => ({
  id,
  firstName: name.split(" ")[0],
  lastName: name.split(" ")[1],
  name,
  gender,
  admissionNumber: `ADM-2026-000${id.slice(1)}`,
  dateOfBirth: "2016-05-14",
  admissionDate: "2026-06-01",
  status: "active",
  place: { enrolmentId: `e${id}`, classId, className, sectionId: sectionName ? `${classId}-${sectionName}` : null, sectionName, rollNumber: null },
  primaryGuardian: { id: "g1", name: "Ravi Verma", relation: "Father", mobile: "9876543210" },
});
export const DEV = student("s0", "Dev Rao", "c1", "Class 1", null, "Male");
export const ASHA = student("s1", "Asha Verma", "c5", "Class 5", "A");
export const BINA = student("s2", "Bina Rao", "c5", "Class 5", "B");

/** What the server answers to `GET /students`: the students the filters in the address keep, class by class. */
export function studentsFor(query: URLSearchParams): StudentPage {
  const text = (query.get("q") ?? "").toLowerCase();
  const department = query.get("departmentId");
  const inDepartment = (s: StudentRow) => {
    const c = STRUCTURE.classes.find((x) => x.id === s.place?.classId);
    return !department || (department === "none" ? !c?.departmentId : c?.departmentId === department);
  };
  const items = [DEV, ASHA, BINA].filter(
    (s) =>
      inDepartment(s) &&
      (!query.get("classId") || s.place?.classId === query.get("classId")) &&
      (!query.get("sectionId") || s.place?.sectionId === query.get("sectionId")) &&
      (!query.get("gender") || s.gender === query.get("gender")) &&
      (!text || s.name.toLowerCase().includes(text))
  );
  return { academicYear: { id: "y1", name: "2026-2027" }, items, page: 1, limit: 12, total: items.length, totalPages: 1 };
}
