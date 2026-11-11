import { z } from "zod";
import { CREW_ROLES, MAX_NAME, MAX_NOTES, MAX_SEATS, MAX_STOPS, VEHICLE_TYPES } from "../constants";

const OBJECT_ID = /^[a-f\d]{24}$/i;
export const objectId = z.string().regex(OBJECT_ID, "Invalid id");
export const idParamSchema = z.object({ id: objectId });

/** A name typed by a person: trimmed, inner spaces collapsed, no angle brackets. */
const label = (what: string, max = MAX_NAME) =>
  z
    .string({ required_error: `Enter the ${what}`, invalid_type_error: `Enter the ${what}` })
    .trim()
    .min(1, `Enter the ${what}`)
    .max(max, `Keep the ${what} under ${max} characters`)
    .regex(/^[^<>]*$/, `The ${what} cannot contain < or >`)
    .transform((v) => v.replace(/\s+/g, " "));

/** An optional text: empty means none. */
const note = (what: string, max: number) =>
  z
    .string({ invalid_type_error: `The ${what} must be text` })
    .trim()
    .max(max, `Keep the ${what} under ${max} characters`)
    .regex(/^[^<>]*$/, `The ${what} cannot contain < or >`)
    .nullish()
    .transform((v) => (v ? v.replace(/\s+/g, " ") : null));

/** A calendar day, "2027-03-31", a real one; empty means not given. */
export const day = (what: string) =>
  z
    .string({ invalid_type_error: `Write the ${what} as a day` })
    .trim()
    .nullish()
    .refine((v) => !v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00.000Z`).toISOString().slice(0, 10) === v), `Write the ${what} as a real day, YYYY-MM-DD`)
    .transform((v) => v || null);

/** A time of day, "07:30", 24 hours; empty means not given. */
const time = (what: string) =>
  z
    .string({ invalid_type_error: `Write the ${what} as a time` })
    .trim()
    .nullish()
    .refine((v) => !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), `Write the ${what} as a time, like 07:30`)
    .transform((v) => v || null);

const mobile = (what: string) =>
  z
    .string({ required_error: `Enter the ${what}`, invalid_type_error: `Enter the ${what}` })
    .trim()
    .transform((v) => v.replace(/[\s-]/g, "").replace(/^(\+91|0)(?=\d{10}$)/, ""))
    .refine((v) => /^[6-9]\d{9}$/.test(v), `The ${what} is 10 digits, starting with 6, 7, 8 or 9`);

const optionalMobile = (what: string) =>
  z
    .string({ invalid_type_error: `The ${what} must be text` })
    .trim()
    .nullish()
    .transform((v) => (v ? v.replace(/[\s-]/g, "").replace(/^(\+91|0)(?=\d{10}$)/, "") : null))
    .refine((v) => v === null || /^[6-9]\d{9}$/.test(v), `The ${what} is 10 digits, starting with 6, 7, 8 or 9`);

/** The plate: letters, digits, spaces and dashes, 6 to 20 characters. */
export const PLATE_MESSAGE = "Write the number on the plate, like MP09 AB 1234 (letters and digits)";
const plate = z
  .string({ required_error: "Enter the registration number", invalid_type_error: "Enter the registration number" })
  .trim()
  .transform((v) => v.toUpperCase().replace(/\s+/g, " "))
  .refine((v) => /^[A-Z0-9][A-Z0-9 -]{4,18}[A-Z0-9]$/.test(v), PLATE_MESSAGE);

const status = z.enum(["active", "inactive", "all"]).default("active");

// ---- vehicles
export const vehicleBody = z.object({
  number: label("vehicle number (like Bus 1)"),
  registrationNumber: plate,
  type: z.enum(VEHICLE_TYPES, { errorMap: () => ({ message: "Choose the kind of vehicle" }) }).default("bus"),
  seats: z.coerce.number({ invalid_type_error: "Enter the seats" }).int("Seats is a whole number").min(1, "A vehicle has at least 1 seat").max(MAX_SEATS, `Seats are up to ${MAX_SEATS}`),
  model: note("model", MAX_NAME),
  insuranceExpiry: day("insurance end day"),
  fitnessExpiry: day("fitness end day"),
  pollutionExpiry: day("pollution (PUC) end day"),
  permitExpiry: day("permit end day"),
  notes: note("note", MAX_NOTES),
});
export const createVehicleSchema = vehicleBody;
export const updateVehicleSchema = vehicleBody.partial().extend({ isActive: z.boolean().optional() }).refine((v) => Object.keys(v).length > 0, "Nothing to change");
export const listVehiclesQuerySchema = z.object({ search: z.string().trim().max(60).optional(), status });
export type VehicleInput = z.infer<typeof createVehicleSchema>;
export type VehicleUpdate = z.infer<typeof updateVehicleSchema>;

// ---- drivers and attendants
export const crewBody = z.object({
  name: label("name"),
  role: z.enum(CREW_ROLES, { errorMap: () => ({ message: "Choose driver or attendant" }) }).default("driver"),
  mobile: mobile("mobile number"),
  emergencyMobile: optionalMobile("emergency number"),
  licenseNumber: note("licence number", 25),
  licenseExpiry: day("licence end day"),
  address: note("address", 200),
  joiningDate: day("joining day"),
  notes: note("note", MAX_NOTES),
});
export const createCrewSchema = crewBody;
export const updateCrewSchema = crewBody.partial().extend({ isActive: z.boolean().optional() }).refine((v) => Object.keys(v).length > 0, "Nothing to change");
export const listCrewQuerySchema = z.object({ search: z.string().trim().max(60).optional(), status, role: z.enum(["driver", "attendant", "all"]).default("all") });
export type CrewInput = z.infer<typeof createCrewSchema>;
export type CrewUpdate = z.infer<typeof updateCrewSchema>;

// ---- routes
const stop = z.object({
  name: label("stop name"),
  pickupTime: time("pick-up time"),
  dropTime: time("drop time"),
  // An empty box is no fee (null), not 0.
  fee: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number({ invalid_type_error: "The fee is a number" }).min(0, "The fee cannot be below 0").max(100000, "The fee is too large").nullable()),
});
export const routeBody = z.object({
  name: label("route name"),
  vehicleId: objectId.nullish().transform((v) => v ?? null),
  driverId: objectId.nullish().transform((v) => v ?? null),
  attendantId: objectId.nullish().transform((v) => v ?? null),
  morningStart: time("morning start time"),
  afternoonStart: time("afternoon start time"),
  stops: z.array(stop).max(MAX_STOPS, `A route has up to ${MAX_STOPS} stops`).default([]),
  notes: note("note", MAX_NOTES),
});
export const createRouteSchema = routeBody;
export const updateRouteSchema = routeBody.partial().extend({ isActive: z.boolean().optional() }).refine((v) => Object.keys(v).length > 0, "Nothing to change");
export const listRoutesQuerySchema = z.object({ search: z.string().trim().max(60).optional(), status });
export type RouteInput = z.infer<typeof createRouteSchema>;
export type RouteUpdate = z.infer<typeof updateRouteSchema>;
