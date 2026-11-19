/**
 * Transport (2026-11-10): the school's vehicles (a bus, a van), the people who run them (drivers and attendants) and the routes (the stops,
 * the times, which vehicle and which people). One school's own list, the same every year (no academic year on these records).
 */

export const VEHICLE_TYPES = ["bus", "mini_bus", "van", "auto", "other"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];
export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = { bus: "Bus", mini_bus: "Mini bus", van: "Van", auto: "Auto / e-rickshaw", other: "Other" };

/** A driver drives; an attendant (conductor, bus aunty / uncle) rides along and looks after the children. */
export const CREW_ROLES = ["driver", "attendant"] as const;
export type CrewRole = (typeof CREW_ROLES)[number];

/** The papers a vehicle must keep valid, as the law asks in India: the fields of Vehicle that hold their last day. */
export const VEHICLE_DOCUMENTS = [
  { key: "insuranceExpiry", label: "Insurance" },
  { key: "fitnessExpiry", label: "Fitness certificate" },
  { key: "pollutionExpiry", label: "Pollution (PUC)" },
  { key: "permitExpiry", label: "Permit" },
] as const;
export type VehicleDocumentKey = (typeof VEHICLE_DOCUMENTS)[number]["key"];

/** A paper that ends within this many days is "soon" (amber); one that has ended is "expired" (red). */
export const EXPIRY_SOON_DAYS = 30;

export const MAX_VEHICLES = 200;
export const MAX_CREW = 300;
export const MAX_ROUTES = 200;
export const MAX_STOPS = 60;
export const MAX_NAME = 60;
export const MAX_NOTES = 300;
export const MAX_SEATS = 120;

/**
 * Live tracking (2026-11-19): the driver's phone sends its position while a trip runs; the school's office watches the vehicles on a map.
 * The driver does not sign in: the school gives each vehicle a private link whose secret is checked on every ping.
 */
/** A vehicle that has not reported for this long is shown as "offline" (the phone was locked, lost signal, or the trip ended). */
export const LIVE_WITHIN_SECONDS = 120;
/** A position older than this is thrown away on its own (the collection keeps one row per vehicle, so this only clears vehicles gone quiet). */
export const POSITION_KEEP_DAYS = 30;
