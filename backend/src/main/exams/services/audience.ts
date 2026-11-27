import type { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { Department } from "../../academics/models/Department";
import { SchoolClass } from "../../academics/models/SchoolClass";
import type { ExamScope } from "../constants";
import type { IExam } from "../models/Exam";
import { asId } from "./dto";

/**
 * Whom an exam is for (2026-11-26, the user: "exam poore school ka hoga ya kisi department ka ya kisi class ka"): the whole school, the classes
 * of some departments, or some classes. Read from the school's classes and departments once, for one exam or a whole list.
 */

export interface AudienceDto {
  /** "Whole school", "Primary and Middle", "Class 9 and Class 10". */
  label: string;
  /** The departments it names (for "departments"), in the school's order. */
  departments: { id: string; name: string }[];
  /** The classes it is for, in the school's order: every active class, the active classes of its departments, or the classes it names. */
  classes: { id: string; name: string; order: number }[];
}

export type Whom = Pick<IExam, "scope" | "departmentIds" | "classIds">;

interface ClassRow {
  _id: Types.ObjectId;
  name: string;
  order: number;
  departmentId: Types.ObjectId | null;
  status?: string;
}

/** The school's classes (in the teaching order) and departments, read once. */
export interface SchoolLayout {
  classes: ClassRow[];
  departments: { _id: Types.ObjectId; name: string; status?: string }[];
}

export async function schoolLayout(tenantId: string): Promise<SchoolLayout> {
  const school = asId(tenantId);
  const [classes, departments] = await Promise.all([
    SchoolClass.find({ tenantId: school }).select("name order departmentId status").lean(),
    Department.find({ tenantId: school }).select("name status").lean(),
  ]);
  return { classes: [...classes].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)) as ClassRow[], departments };
}

const joinNames = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
const isActive = (row: { status?: string }) => row.status !== "inactive";

/** Whom the exam is for, with its classes. An exam made before there was a scope is for the whole school. */
export function audienceOf(exam: Whom, layout: SchoolLayout): AudienceDto {
  const scope: ExamScope = exam.scope ?? "school";
  const ref = (c: ClassRow) => ({ id: c._id.toString(), name: c.name, order: c.order });
  if (scope === "departments") {
    const picked = new Set((exam.departmentIds ?? []).map(String));
    const classes = layout.classes.filter((c) => isActive(c) && c.departmentId && picked.has(c.departmentId.toString()));
    // A department sits where its first class sits; one with no class after the others, by name.
    const firstOrder = (id: string) => layout.classes.find((c) => c.departmentId?.toString() === id)?.order ?? Number.MAX_SAFE_INTEGER;
    const departments = layout.departments
      .filter((d) => picked.has(d._id.toString()))
      .sort((a, b) => firstOrder(a._id.toString()) - firstOrder(b._id.toString()) || a.name.localeCompare(b.name))
      .map((d) => ({ id: d._id.toString(), name: d.name }));
    return { label: joinNames(departments.map((d) => d.name)), departments, classes: classes.map(ref) };
  }
  if (scope === "classes") {
    const picked = new Set((exam.classIds ?? []).map(String));
    const classes = layout.classes.filter((c) => picked.has(c._id.toString())).map(ref);
    return { label: joinNames(classes.map((c) => c.name)), departments: [], classes };
  }
  return { label: "Whole school", departments: [], classes: layout.classes.filter(isActive).map(ref) };
}

/** Whether a class is one the exam is for (a class made inactive since stays in an exam that named it, or whose department it is in). */
export function isInAudience(exam: Whom, klass: Pick<ClassRow, "_id" | "departmentId">): boolean {
  const scope: ExamScope = exam.scope ?? "school";
  if (scope === "departments") return !!klass.departmentId && (exam.departmentIds ?? []).some((d) => d.equals(klass.departmentId!));
  if (scope === "classes") return (exam.classIds ?? []).some((c) => c.equals(klass._id));
  return true;
}

/**
 * The scope as it is kept: the whole school names nothing; departments name only departments of this school that are active (or already named);
 * classes only classes of this school that are active (or already named). Refuses anything else, under the box it belongs to.
 */
export function cleanWhom(
  input: { scope: ExamScope; departmentIds: string[]; classIds: string[] },
  layout: SchoolLayout,
  kept: Whom | null
): { scope: ExamScope; departmentIds: Types.ObjectId[]; classIds: Types.ObjectId[] } {
  const had = (list: Types.ObjectId[] | undefined, id: string) => (list ?? []).some((x) => x.toString() === id);
  if (input.scope === "departments") {
    const ok = input.departmentIds.every((id) => layout.departments.some((d) => d._id.toString() === id && (isActive(d) || had(kept?.departmentIds, id))));
    if (!ok) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "departmentIds", message: "Choose departments of this school" }]);
    return { scope: "departments", departmentIds: input.departmentIds.map(asId), classIds: [] };
  }
  if (input.scope === "classes") {
    const ok = input.classIds.every((id) => layout.classes.some((c) => c._id.toString() === id && (isActive(c) || had(kept?.classIds, id))));
    if (!ok) throw ApiError.badRequest("Invalid request data", "VALIDATION_ERROR", [{ path: "classIds", message: "Choose classes of this school" }]);
    return { scope: "classes", departmentIds: [], classIds: input.classIds.map(asId) };
  }
  return { scope: "school", departmentIds: [], classIds: [] };
}
