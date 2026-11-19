/** The school's transport (backend/src/main/transport): vehicles, the people who run them, and routes with stops. */

export type VehicleType = "bus" | "mini_bus" | "van" | "auto" | "other";
export type CrewRole = "driver" | "attendant";
export type PaperStatus = "ok" | "soon" | "expired" | "missing";

/** One paper that must stay valid (a vehicle's insurance, a driver's licence) and how it stands today. */
export interface Paper {
  key: string;
  label: string;
  /** The last valid day, "2027-03-31"; null when not given. */
  expiry: string | null;
  status: PaperStatus;
  /** Days left (negative once it has ended); null when no day was given. */
  daysLeft: number | null;
}

export interface Vehicle {
  id: string;
  /** The school's own name for it: "Bus 1". */
  number: string;
  /** The number on its plate. */
  registrationNumber: string;
  type: VehicleType;
  typeLabel: string;
  seats: number;
  model: string | null;
  insuranceExpiry: string | null;
  fitnessExpiry: string | null;
  pollutionExpiry: string | null;
  permitExpiry: string | null;
  notes: string | null;
  isActive: boolean;
  papers: Paper[];
  /** The names of the routes it runs. */
  routes: string[];
}

export interface CrewMember {
  id: string;
  name: string;
  role: CrewRole;
  mobile: string;
  emergencyMobile: string | null;
  licenseNumber: string | null;
  licenseExpiry: string | null;
  /** A driver's licence; null for an attendant. */
  license: Paper | null;
  address: string | null;
  joiningDate: string | null;
  notes: string | null;
  isActive: boolean;
  routes: string[];
}

export interface RouteStop {
  name: string;
  /** "07:10", 24 hours; null when not given. */
  pickupTime: string | null;
  dropTime: string | null;
  /** The monthly fee for a child who boards here (rupees). */
  fee: number | null;
}

export interface TransportRoute {
  id: string;
  name: string;
  vehicleId: string | null;
  vehicle: { id: string; number: string; registrationNumber: string; seats: number; isActive: boolean } | null;
  driverId: string | null;
  driver: { id: string; name: string; mobile: string; isActive: boolean } | null;
  attendantId: string | null;
  attendant: { id: string; name: string; mobile: string; isActive: boolean } | null;
  morningStart: string | null;
  afternoonStart: string | null;
  stops: RouteStop[];
  notes: string | null;
  isActive: boolean;
}

/** A paper that has ended or ends within a month. */
export interface AttentionItem {
  kind: "vehicle" | "driver";
  id: string;
  who: string;
  what: string;
  expiry: string;
  status: "soon" | "expired";
  daysLeft: number;
}

export interface TransportSummary {
  vehicles: { total: number; seats: number; inactive: number };
  drivers: { total: number; attendants: number };
  routes: { total: number; stops: number; withoutVehicle: number; withoutDriver: number };
  attention: AttentionItem[];
  attentionCount: number;
}

export type TransportStatus = "active" | "inactive" | "all";

/** What a vehicle is saved with (empty days and notes are sent as empty text; the server reads them as none). */
export interface VehicleBody {
  number: string;
  registrationNumber: string;
  type: VehicleType;
  seats: number | string;
  model: string;
  insuranceExpiry: string;
  fitnessExpiry: string;
  pollutionExpiry: string;
  permitExpiry: string;
  notes: string;
  isActive?: boolean;
}

export interface CrewBody {
  name: string;
  role: CrewRole;
  mobile: string;
  emergencyMobile: string;
  licenseNumber: string;
  licenseExpiry: string;
  address: string;
  joiningDate: string;
  notes: string;
  isActive?: boolean;
}

export interface RouteBody {
  name: string;
  vehicleId: string | null;
  driverId: string | null;
  attendantId: string | null;
  morningStart: string;
  afternoonStart: string;
  stops: { name: string; pickupTime: string; dropTime: string; fee: string }[];
  notes: string;
  isActive?: boolean;
}
