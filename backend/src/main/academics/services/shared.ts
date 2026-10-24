import type { ISchoolClass } from "../models/SchoolClass";
import type { ISection } from "../models/Section";

/** The shapes that leave the API. Ids are strings, dates and internal keys stay inside. */
export interface SectionDto {
  id: string;
  classId: string;
  name: string;
  capacity: number | null;
  room: string | null;
}

export interface ClassDto {
  id: string;
  name: string;
  order: number;
  departmentId: string | null;
  sections: SectionDto[];
}

export interface DepartmentDto {
  id: string;
  name: string;
  classCount: number;
}

export const toSectionDto = (s: Pick<ISection, "_id" | "classId" | "name" | "capacity" | "room">): SectionDto => ({
  id: s._id.toString(),
  classId: s.classId.toString(),
  name: s.name,
  capacity: s.capacity ?? null,
  room: s.room ?? null,
});

/** "2" sorts before "10", "A" before "B". */
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

export const toClassDto = (
  c: Pick<ISchoolClass, "_id" | "name" | "order" | "departmentId">,
  sections: Pick<ISection, "_id" | "classId" | "name" | "capacity" | "room">[]
): ClassDto => ({
  id: c._id.toString(),
  name: c.name,
  order: c.order,
  departmentId: c.departmentId ? c.departmentId.toString() : null,
  sections: sections.map(toSectionDto).sort(byName),
});

export function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === 11000;
}
