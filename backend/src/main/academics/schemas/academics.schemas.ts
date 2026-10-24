import { z } from "zod";
import { CLASS_LEVELS } from "../../tenants/constants";
import { MAX_CLASSES, MAX_NEW_SECTIONS, MAX_SECTIONS_PER_CLASS, MAX_SECTION_CAPACITY } from "../constants";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

export const idParamSchema = z.object({ id: objectId });

/** A name typed by a person: trimmed, inner spaces collapsed, no angle brackets. */
function label(what: string, max: number) {
  return z
    .string({ required_error: `Enter the ${what}` })
    .trim()
    .min(1, `Enter the ${what}`)
    .max(max, `Keep the ${what} under ${max} characters`)
    .regex(/^[^<>]*$/, `The ${what} cannot contain < or >`)
    .transform((value) => value.replace(/\s+/g, " "));
}

const capacity = z
  .number({ invalid_type_error: "Capacity must be a number" })
  .int("Capacity must be a whole number")
  .min(1, "Capacity must be at least 1")
  .max(MAX_SECTION_CAPACITY, `Capacity cannot be more than ${MAX_SECTION_CAPACITY}`);

/** An empty room means "clear it". */
const room = z
  .string()
  .trim()
  .max(30, "Keep the room under 30 characters")
  .regex(/^[^<>]*$/, "The room cannot contain < or >")
  .transform((value) => value || null);

const hasAChange = (value: object) => Object.keys(value).length > 0;
const NOTHING_TO_CHANGE = { message: "Nothing to change" };

export const departmentSchema = z.object({ name: label("department name", 60) });

/**
 * "Put these classes in the department with this name": the name is picked from the usual ones or typed by the school, and the
 * department is created when the school does not have it yet. No classes is allowed (it then only makes the department).
 */
export const assignDepartmentSchema = z.object({
  name: label("department name", 60),
  classIds: z.array(objectId).max(MAX_CLASSES).default([]),
});

/**
 * Fill one department from its own screen: classes the school already has are moved into it (`classIds`), and classes it does not
 * have yet are created in it (`names`, each with `sectionCount` sections, none by default).
 */
export const addClassesSchema = z
  .object({
    classIds: z.array(objectId).max(MAX_CLASSES).default([]),
    names: z.array(label("class name", 40)).max(MAX_CLASSES).default([]),
    sectionCount: z.number().int().min(0).max(MAX_NEW_SECTIONS, `You can add up to ${MAX_NEW_SECTIONS} sections at once`).default(0),
  })
  .refine((value) => value.classIds.length + value.names.length > 0, { message: "Choose at least one class to add", path: ["classIds"] });

/** A number from the query string: absent or empty means "no limit", anything else must be a whole number in range. */
const optionalCount = (max: number) =>
  z.preprocess((value) => (value === "" || value === undefined ? undefined : value), z.coerce.number().int().min(0).max(max).optional());

/**
 * What the class list can be asked: by name, by department (an id, or `none` for the classes in no department), by how many
 * seats the class has in all its sections, sorted, a page at a time. The server does all of it, so a screen never has to
 * download every class to filter them.
 */
export const listClassesQuerySchema = z
  .object({
    search: z
      .string()
      .trim()
      .max(40)
      .optional()
      .transform((value) => value || undefined),
    departmentId: z.union([objectId, z.literal("none")]).optional(),
    seatsMin: optionalCount(MAX_SECTION_CAPACITY * MAX_SECTIONS_PER_CLASS),
    seatsMax: optionalCount(MAX_SECTION_CAPACITY * MAX_SECTIONS_PER_CLASS),
    sort: z.enum(["order", "name", "seats"]).default("order"),
    dir: z.enum(["asc", "desc"]).default("asc"),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .refine((q) => q.seatsMin === undefined || q.seatsMax === undefined || q.seatsMin <= q.seatsMax, {
    message: "The fewest seats cannot be more than the most seats",
    path: ["seatsMax"],
  });

export const createClassSchema = z.object({
  name: label("class name", 40),
  departmentId: objectId.nullable().optional(),
  /** How many sections to start with: 1 gives "A", 3 gives "A, B, C". 0 makes a class with none. */
  sectionCount: z
    .number()
    .int()
    .min(0)
    .max(MAX_NEW_SECTIONS, `You can add up to ${MAX_NEW_SECTIONS} sections at once`)
    .optional()
    .default(1),
});

export const updateClassSchema = z
  .object({ name: label("class name", 40), departmentId: objectId.nullable() })
  .partial()
  .refine(hasAChange, NOTHING_TO_CHANGE);

/** The school's switches for its academic data (see Tenant.settings). */
export const academicSettingsSchema = z.object({
  sectionDetailsRequired: z.boolean({ required_error: "Choose on or off", invalid_type_error: "Choose on or off" }),
});

export const createSectionSchema = z.object({
  name: label("section name", 20),
  capacity: capacity.nullable().optional(),
  room: room.nullable().optional(),
});

export const updateSectionSchema = z
  .object({ name: label("section name", 20), capacity: capacity.nullable(), room: room.nullable() })
  .partial()
  .refine(hasAChange, NOTHING_TO_CHANGE);

export const quickSetupSchema = z
  .object({
    fromClass: z.enum(CLASS_LEVELS),
    toClass: z.enum(CLASS_LEVELS),
    /** 0 makes the classes only: a class does not need sections, and the school adds them class by class. */
    sectionsPerClass: z.number().int().min(0).max(6),
  })
  .refine((value) => CLASS_LEVELS.indexOf(value.fromClass) <= CLASS_LEVELS.indexOf(value.toClass), {
    message: "The first class must come before the last one",
    path: ["toClass"],
  });

export type DepartmentInput = z.infer<typeof departmentSchema>;
export type AssignDepartmentInput = z.infer<typeof assignDepartmentSchema>;
export type AddClassesInput = z.infer<typeof addClassesSchema>;
export type ListClassesQuery = z.infer<typeof listClassesQuerySchema>;
export type CreateClassInput = z.infer<typeof createClassSchema>;
export type UpdateClassInput = z.infer<typeof updateClassSchema>;
export type CreateSectionInput = z.infer<typeof createSectionSchema>;
export type AcademicSettingsInput = z.infer<typeof academicSettingsSchema>;
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;
export type QuickSetupInput = z.infer<typeof quickSetupSchema>;
