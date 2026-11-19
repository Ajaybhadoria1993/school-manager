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

/** A class or a department is never deleted: the school makes it inactive, and active again. */
export type ActiveStatus = "active" | "inactive";

/** When and by whom a class or department was made inactive. */
export interface InactiveNote {
  /** An ISO date-time. */
  at: string;
  by: { name: string; role: string };
}

export interface ClassItem {
  id: string;
  name: string;
  /** Teaching order, lowest first. The API already sends classes in this order. */
  order: number;
  departmentId: string | null;
  /** The seats of the whole class, with or without sections; null until the school says (a class made in bulk, or before seats existed). */
  capacity: number | null;
  /** The server always sends it; a class without one counts as active. */
  status?: ActiveStatus;
  /** Set while the class is inactive. */
  inactive?: InactiveNote | null;
  sections: SectionItem[];
}

/** A wing of the school that groups classes (Primary, Middle...). */
export interface DepartmentItem {
  id: string;
  name: string;
  /** Its active classes. */
  classCount: number;
  /** The server always sends it; a department without one counts as active. */
  status?: ActiveStatus;
  /** Set while the department is inactive. */
  inactive?: InactiveNote | null;
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

/** The next session: the same, and whether the sections of the running year are copied into it (they are by default). */
export interface NextAcademicYearInput extends AcademicYearInput {
  copySections: boolean;
  /** Also copy what each class studies and its timetable (as drafts). */
  copyTimetable: boolean;
}

/** What the server says when the next year is made: the year, and how many sections, class lists and timetables it copied. */
export type NextAcademicYear = AcademicYear & { sectionsCopied: number; allotmentsCopied: number; timetablesCopied: number };

/** What the server says when a year is switched on: the year, and how many students left (inactive) with the promotion list. */
export type ActivatedAcademicYear = AcademicYear & { leftSchool: number };

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
  /** The active ones, in the order to show them. */
  departments: DepartmentItem[];
  /** The active ones, in teaching order, each with its sections. (Looking at a past year, the ones made inactive since are here too.) */
  classes: ClassItem[];
  /** Made inactive: kept apart so every picker offers only what the school works with; listed where they are made active again. */
  inactiveDepartments?: DepartmentItem[];
  inactiveClasses?: ClassItem[];
  totals: {
    departments: number;
    classes: number;
    sections: number;
    /** The seats of all the classes added up; a class whose seats are not set adds nothing. */
    seats: number;
  };
}

export interface ClassInput {
  name: string;
  departmentId: string | null;
  /** The seats of the whole class. */
  capacity: number;
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

/** "Divide this class into sections": how many, the seats of each, and a room for each (when the school asks for rooms). */
export interface DivideClassInput {
  count: number;
  capacity: number;
  rooms?: (string | null)[];
}

export interface DivideClassResult {
  class: ClassItem;
  /** The sections that were made, each with the students it now has. */
  sections: { id: string; name: string; capacity: number; room: string | null; students: number }[];
  /** How many students were moved out of the class itself into its sections. */
  moved: number;
  /** The class's seats before (null: not set) and after. */
  classSeats: { from: number | null; to: number };
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
  /** Which classes: the active ones (what the server answers when this is absent), the inactive ones, or both. */
  status?: "active" | "inactive" | "all";
  /** The fewest and the most seats a class has. */
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
  /** The seats each of those new classes has (asked for only when `names` is not empty). */
  capacity?: number;
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
