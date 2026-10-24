/** One section of a class: "A", "B", or a stream such as "Science". */
export interface SectionItem {
  id: string;
  classId: string;
  name: string;
  /** The most students it should have; null when no limit was set. */
  capacity: number | null;
  /** Where it sits ("Room 12"); null when not given. */
  room: string | null;
}

export interface ClassItem {
  id: string;
  name: string;
  /** Teaching order, lowest first. The API already sends classes in this order. */
  order: number;
  departmentId: string | null;
  sections: SectionItem[];
}

/** A wing of the school that groups classes (Primary, Middle...). */
export interface DepartmentItem {
  id: string;
  name: string;
  classCount: number;
}

/** One academic session of the school ("2026-2027"). The days are calendar days, "2026-04-01". */
export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "pending" | "active" | "closed";
  activatedAt: string | null;
}

/** The school's current session: `year` is null when it has none; `needsSetUp` when it has none at all (approved before academic years existed). */
export interface CurrentAcademicYear {
  year: AcademicYear | null;
  needsSetUp: boolean;
}

export interface AcademicYearInput {
  name: string;
  startDate: string;
  endDate: string;
}

/** The school's switches for its academic data. */
export interface AcademicSettings {
  /** A section must have its seats and its room (on until the school makes them optional). */
  sectionDetailsRequired: boolean;
}

/** The whole class / section layout of the school, as one piece. */
export interface AcademicStructure {
  /** The session the sections belong to; null for a school without an academic year yet. */
  academicYear: { id: string; name: string } | null;
  settings: AcademicSettings;
  /** In the order to show them. */
  departments: DepartmentItem[];
  /** In teaching order, each with its sections. */
  classes: ClassItem[];
  totals: {
    departments: number;
    classes: number;
    sections: number;
    /** The sum of the limits that were set. */
    seats: number;
  };
}

export interface ClassInput {
  name: string;
  departmentId: string | null;
}

export interface NewClassInput extends ClassInput {
  /** How many sections to start with: 1 gives "A", 3 gives "A, B, C". */
  sectionCount: number;
}

export interface SectionInput {
  name: string;
  capacity: number | null;
  room: string | null;
}

export interface QuickSetupInput {
  fromClass: string;
  toClass: string;
  sectionsPerClass: number;
}

export interface AssignDepartmentInput {
  /** Picked from the usual wings or typed; the server makes the department when the school has none by this name. */
  name: string;
  classIds: string[];
}

export interface AssignDepartmentResult {
  department: DepartmentItem;
  /** False when the school already had a department by that name and it was reused. */
  created: boolean;
  /** How many classes were put in it. */
  assigned: number;
}

/** What the class list is asked: the server filters, sorts and cuts it into pages. */
export interface ClassListQuery {
  /** Part of the class name. */
  search?: string;
  /** A department's id, or "none" for the classes that are in no department. Absent = every department. */
  departmentId?: string;
  /** The fewest and the most seats a class has in all its sections. */
  seatsMin?: number;
  seatsMax?: number;
  sort?: "order" | "name" | "seats";
  dir?: "asc" | "desc";
  page?: number;
  limit?: number;
}

/** One page of the class list. */
export interface ClassPage {
  items: ClassItem[];
  page: number;
  limit: number;
  /** How many classes matched in all, not only on this page. */
  total: number;
  totalPages: number;
}

export interface AddClassesInput {
  /** Classes the school already has, to move into the department. */
  classIds: string[];
  /** Classes it does not have yet, to create in the department. */
  names: string[];
  /** Sections each new class starts with (0 = none). */
  sectionCount: number;
}

export interface AddClassesResult {
  department: DepartmentItem;
  moved: number;
  created: number;
}

export interface QuickSetupResult {
  departmentsCreated: number;
  classesCreated: number;
  /** Classes that were already there and were left alone. */
  classesSkipped: number;
  sectionsCreated: number;
}
