import type { IDepartment } from "../models/Department";
import type { ISchoolClass } from "../models/SchoolClass";
import type { ISection } from "../models/Section";
import { isInactive, type ActiveStatus, type InactiveRecord } from "../models/status";

/** The shapes that leave the API. Ids are strings, dates and internal keys stay inside. */
export interface SectionDto {
  id: string;
  classId: string;
  name: string;
  capacity: number | null;
  room: string | null;
}

/** When and by whom a class or department was made inactive (no ids: the person's name and role as they were then). */
export interface InactiveDto {
  at: string;
  by: { name: string; role: string };
}

export interface ClassDto {
  id: string;
  name: string;
  order: number;
  departmentId: string | null;
  /** The seats of the whole class; null until the school says (a class made in bulk or before seats existed). */
  capacity: number | null;
  status: ActiveStatus;
  /** Set while the class is inactive. */
  inactive: InactiveDto | null;
  sections: SectionDto[];
}

export interface DepartmentDto {
  id: string;
  name: string;
  /** Its active classes (the ones a school works with). */
  classCount: number;
  status: ActiveStatus;
  inactive: InactiveDto | null;
}

export const toSectionDto = (s: Pick<ISection, "_id" | "classId" | "name" | "capacity" | "room">): SectionDto => ({
  id: s._id.toString(),
  classId: s.classId.toString(),
  name: s.name,
  capacity: s.capacity ?? null,
  room: s.room ?? null,
});

const toInactiveDto = (record: InactiveRecord | null | undefined): InactiveDto | null =>
  record ? { at: record.at.toISOString(), by: { name: record.by.name, role: record.by.role } } : null;

export const toDepartmentDto = (d: Pick<IDepartment, "_id" | "name" | "status" | "inactive">, classCount: number): DepartmentDto => ({
  id: d._id.toString(),
  name: d.name,
  classCount,
  status: isInactive(d) ? "inactive" : "active",
  inactive: isInactive(d) ? toInactiveDto(d.inactive) : null,
});

/** "2" sorts before "10", "A" before "B". */
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

export const toClassDto = (
  c: Pick<ISchoolClass, "_id" | "name" | "order" | "departmentId" | "capacity"> & Partial<Pick<ISchoolClass, "status" | "inactive">>,
  sections: Pick<ISection, "_id" | "classId" | "name" | "capacity" | "room">[]
): ClassDto => ({
  id: c._id.toString(),
  name: c.name,
  order: c.order,
  departmentId: c.departmentId ? c.departmentId.toString() : null,
  capacity: c.capacity ?? null,
  status: isInactive(c) ? "inactive" : "active",
  inactive: isInactive(c) ? toInactiveDto(c.inactive) : null,
  sections: sections.map(toSectionDto).sort(byName),
});

export function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === 11000;
}
