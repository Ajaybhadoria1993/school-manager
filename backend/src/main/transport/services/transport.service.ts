import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { todayInIndia } from "../../students/schemas/students.schemas";
import { EXPIRY_SOON_DAYS, MAX_CREW, MAX_ROUTES, MAX_VEHICLES, VEHICLE_DOCUMENTS, VEHICLE_TYPE_LABELS } from "../constants";
import { CrewMember, type ICrewMember } from "../models/CrewMember";
import { TransportRoute, type ITransportRoute } from "../models/TransportRoute";
import { Vehicle, type IVehicle } from "../models/Vehicle";
import type { CrewInput, CrewUpdate, RouteInput, RouteUpdate, VehicleInput, VehicleUpdate } from "../schemas/transport.schemas";

type PaperStatus = "ok" | "soon" | "expired" | "missing";
export interface PaperDto {
  key: string;
  label: string;
  expiry: string | null;
  status: PaperStatus;
  /** Days left (negative once it has ended); null when no day was given. */
  daysLeft: number | null;
}

const keyOf = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
const plateKey = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, "");
const asId = (id: string | Types.ObjectId) => new Types.ObjectId(id.toString());
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const dayNumber = (value: string) => Math.floor(new Date(`${value}T00:00:00.000Z`).getTime() / 86_400_000);

/** How a paper stands today: ended, ending within a month, fine, or not given. */
export function paperOf(key: string, label: string, expiry: string | null, today = todayInIndia()): PaperDto {
  if (!expiry) return { key, label, expiry: null, status: "missing", daysLeft: null };
  const daysLeft = dayNumber(expiry) - dayNumber(today);
  return { key, label, expiry, status: daysLeft < 0 ? "expired" : daysLeft <= EXPIRY_SOON_DAYS ? "soon" : "ok", daysLeft };
}

const PLATE_TAKEN = () => ApiError.conflict("A vehicle with this registration number is already in the list.", "PLATE_TAKEN", [{ path: "registrationNumber", message: "Another vehicle has this registration number" }]);
const NUMBER_TAKEN = () => ApiError.conflict("A vehicle with this number is already in the list.", "VEHICLE_NUMBER_TAKEN", [{ path: "number", message: "Another vehicle has this number" }]);
const MOBILE_TAKEN = (name: string) => ApiError.conflict(`${name} already has this mobile number.`, "CREW_MOBILE_TAKEN", [{ path: "mobile", message: `${name} already has this mobile number` }]);
const ROUTE_NAME_TAKEN = () => ApiError.conflict("A route with this name is already in the list.", "ROUTE_NAME_TAKEN", [{ path: "name", message: "Another route has this name" }]);
const duplicate = (err: unknown) => (err as { code?: number }).code === 11000;

export class TransportService {
  // ---- vehicles ---------------------------------------------------------------------------------------------------------------------
  private static vehicleDto(v: IVehicle, routes: { name: string }[] = []) {
    const papers = VEHICLE_DOCUMENTS.map((d) => paperOf(d.key, d.label, v[d.key]));
    return {
      id: v._id.toString(),
      number: v.number,
      registrationNumber: v.registrationNumber,
      type: v.type,
      typeLabel: VEHICLE_TYPE_LABELS[v.type],
      seats: v.seats,
      model: v.model,
      insuranceExpiry: v.insuranceExpiry,
      fitnessExpiry: v.fitnessExpiry,
      pollutionExpiry: v.pollutionExpiry,
      permitExpiry: v.permitExpiry,
      notes: v.notes,
      isActive: v.isActive,
      papers,
      routes: routes.map((r) => r.name),
    };
  }

  static async listVehicles(tenantId: string, query: { search?: string; status: "active" | "inactive" | "all" }) {
    const school = asId(tenantId);
    const filter: Record<string, unknown> = { tenantId: school };
    if (query.status !== "all") filter.isActive = query.status === "active";
    if (query.search) {
      const re = new RegExp(escapeRe(query.search), "i");
      filter.$or = [{ number: re }, { registrationNumber: re }, { model: re }];
    }
    const [vehicles, routes] = await Promise.all([
      Vehicle.find(filter).sort({ numberKey: 1 }).lean(),
      TransportRoute.find({ tenantId: school, vehicleId: { $ne: null } }).select("name vehicleId").lean(),
    ]);
    const onRoutes = (id: Types.ObjectId) => routes.filter((r) => r.vehicleId?.equals(id));
    return { items: vehicles.map((v) => TransportService.vehicleDto(v, onRoutes(v._id))) };
  }

  static async createVehicle(tenantId: string, input: VehicleInput) {
    const school = asId(tenantId);
    if ((await Vehicle.countDocuments({ tenantId: school })) >= MAX_VEHICLES) throw ApiError.badRequest(`A school can keep ${MAX_VEHICLES} vehicles.`, "TOO_MANY_VEHICLES");
    try {
      const made = await Vehicle.create({ ...input, tenantId: school, numberKey: keyOf(input.number), registrationKey: plateKey(input.registrationNumber) });
      return TransportService.vehicleDto(made.toObject());
    } catch (err) {
      throw TransportService.vehicleClash(err, school, input);
    }
  }

  static async updateVehicle(tenantId: string, id: string, input: VehicleUpdate) {
    const school = asId(tenantId);
    const current = await Vehicle.findOne({ _id: id, tenantId: school }).lean();
    if (!current) throw ApiError.notFound("Vehicle not found", "VEHICLE_NOT_FOUND");
    const set: Record<string, unknown> = { ...input };
    if (input.number !== undefined) set.numberKey = keyOf(input.number);
    if (input.registrationNumber !== undefined) set.registrationKey = plateKey(input.registrationNumber);
    try {
      const saved = await Vehicle.findOneAndUpdate({ _id: id, tenantId: school }, { $set: set }, { new: true }).lean();
      const routes = await TransportRoute.find({ tenantId: school, vehicleId: saved!._id }).select("name").lean();
      return TransportService.vehicleDto(saved!, routes);
    } catch (err) {
      throw TransportService.vehicleClash(err, school, input);
    }
  }

  private static vehicleClash(err: unknown, _school: Types.ObjectId, input: Partial<VehicleInput>) {
    if (!duplicate(err)) return err;
    const message = String((err as { message?: string }).message ?? "");
    return message.includes("one_vehicle_per_plate") || (input.registrationNumber && !message.includes("one_vehicle_per_number")) ? PLATE_TAKEN() : NUMBER_TAKEN();
  }

  static async deleteVehicle(tenantId: string, id: string) {
    const school = asId(tenantId);
    if (!(await Vehicle.exists({ _id: id, tenantId: school }))) throw ApiError.notFound("Vehicle not found", "VEHICLE_NOT_FOUND");
    if (await TransportRoute.exists({ tenantId: school, vehicleId: id })) {
      throw ApiError.conflict("This vehicle is on a route. Take it off the route first, or make it inactive.", "VEHICLE_IN_USE");
    }
    await Vehicle.deleteOne({ _id: id, tenantId: school });
  }

  // ---- drivers and attendants ---------------------------------------------------------------------------------------------------------
  private static crewDto(c: ICrewMember, routes: { name: string }[] = []) {
    return {
      id: c._id.toString(),
      name: c.name,
      role: c.role,
      mobile: c.mobile,
      emergencyMobile: c.emergencyMobile,
      licenseNumber: c.licenseNumber,
      licenseExpiry: c.licenseExpiry,
      license: c.role === "driver" ? paperOf("licenseExpiry", "Licence", c.licenseExpiry) : null,
      address: c.address,
      joiningDate: c.joiningDate,
      notes: c.notes,
      isActive: c.isActive,
      routes: routes.map((r) => r.name),
    };
  }

  static async listCrew(tenantId: string, query: { search?: string; status: "active" | "inactive" | "all"; role: "driver" | "attendant" | "all" }) {
    const school = asId(tenantId);
    const filter: Record<string, unknown> = { tenantId: school };
    if (query.status !== "all") filter.isActive = query.status === "active";
    if (query.role !== "all") filter.role = query.role;
    if (query.search) {
      const re = new RegExp(escapeRe(query.search), "i");
      filter.$or = [{ name: re }, { mobile: re }, { licenseNumber: re }];
    }
    const [people, routes] = await Promise.all([
      CrewMember.find(filter).sort({ name: 1 }).lean(),
      TransportRoute.find({ tenantId: school }).select("name driverId attendantId").lean(),
    ]);
    const onRoutes = (id: Types.ObjectId) => routes.filter((r) => r.driverId?.equals(id) || r.attendantId?.equals(id));
    return { items: people.map((c) => TransportService.crewDto(c, onRoutes(c._id))) };
  }

  static async createCrew(tenantId: string, input: CrewInput) {
    const school = asId(tenantId);
    if ((await CrewMember.countDocuments({ tenantId: school })) >= MAX_CREW) throw ApiError.badRequest(`A school can keep ${MAX_CREW} drivers and attendants.`, "TOO_MANY_CREW");
    try {
      return TransportService.crewDto((await CrewMember.create({ ...input, tenantId: school })).toObject());
    } catch (err) {
      throw await TransportService.crewClash(err, school, input.mobile);
    }
  }

  static async updateCrew(tenantId: string, id: string, input: CrewUpdate) {
    const school = asId(tenantId);
    if (!(await CrewMember.exists({ _id: id, tenantId: school }))) throw ApiError.notFound("Driver or attendant not found", "CREW_NOT_FOUND");
    try {
      const saved = await CrewMember.findOneAndUpdate({ _id: id, tenantId: school }, { $set: input }, { new: true }).lean();
      const routes = await TransportRoute.find({ tenantId: school, $or: [{ driverId: id }, { attendantId: id }] }).select("name").lean();
      return TransportService.crewDto(saved!, routes);
    } catch (err) {
      throw await TransportService.crewClash(err, school, input.mobile);
    }
  }

  private static async crewClash(err: unknown, school: Types.ObjectId, mobile?: string) {
    if (!duplicate(err) || !mobile) return err;
    const holder = await CrewMember.findOne({ tenantId: school, mobile }).select("name").lean();
    return MOBILE_TAKEN(holder?.name ?? "Someone");
  }

  static async deleteCrew(tenantId: string, id: string) {
    const school = asId(tenantId);
    if (!(await CrewMember.exists({ _id: id, tenantId: school }))) throw ApiError.notFound("Driver or attendant not found", "CREW_NOT_FOUND");
    if (await TransportRoute.exists({ tenantId: school, $or: [{ driverId: id }, { attendantId: id }] })) {
      throw ApiError.conflict("This person is on a route. Take them off the route first, or make them inactive.", "CREW_IN_USE");
    }
    await CrewMember.deleteOne({ _id: id, tenantId: school });
  }

  // ---- routes --------------------------------------------------------------------------------------------------------------------------
  /** The vehicle, driver and attendant of a route must be this school's, and the person must be the right kind. */
  private static async checkTeam(school: Types.ObjectId, input: { vehicleId?: string | null; driverId?: string | null; attendantId?: string | null }) {
    const problems: { path: string; message: string }[] = [];
    if (input.vehicleId && !(await Vehicle.exists({ _id: input.vehicleId, tenantId: school }))) problems.push({ path: "vehicleId", message: "Choose a vehicle of your school" });
    if (input.driverId && !(await CrewMember.exists({ _id: input.driverId, tenantId: school, role: "driver" }))) problems.push({ path: "driverId", message: "Choose a driver of your school" });
    if (input.attendantId && !(await CrewMember.exists({ _id: input.attendantId, tenantId: school, role: "attendant" }))) problems.push({ path: "attendantId", message: "Choose an attendant of your school" });
    if (problems.length > 0) throw ApiError.badRequest("Choose the vehicle and the people from your school's lists.", "TEAM_NOT_FOUND", problems);
  }

  private static async routeDtos(school: Types.ObjectId, routes: ITransportRoute[]) {
    const ids = (pick: (r: ITransportRoute) => Types.ObjectId | null) => routes.flatMap((r) => (pick(r) ? [pick(r)!] : []));
    const [vehicles, people] = await Promise.all([
      Vehicle.find({ tenantId: school, _id: { $in: ids((r) => r.vehicleId) } }).select("number registrationNumber seats isActive").lean(),
      CrewMember.find({ tenantId: school, _id: { $in: [...ids((r) => r.driverId), ...ids((r) => r.attendantId)] } }).select("name mobile isActive").lean(),
    ]);
    const vehicle = new Map(vehicles.map((v) => [v._id.toString(), v]));
    const person = new Map(people.map((p) => [p._id.toString(), p]));
    return routes.map((r) => {
      const v = r.vehicleId ? vehicle.get(r.vehicleId.toString()) : undefined;
      const d = r.driverId ? person.get(r.driverId.toString()) : undefined;
      const a = r.attendantId ? person.get(r.attendantId.toString()) : undefined;
      return {
        id: r._id.toString(),
        name: r.name,
        vehicleId: r.vehicleId?.toString() ?? null,
        vehicle: v ? { id: v._id.toString(), number: v.number, registrationNumber: v.registrationNumber, seats: v.seats, isActive: v.isActive } : null,
        driverId: r.driverId?.toString() ?? null,
        driver: d ? { id: d._id.toString(), name: d.name, mobile: d.mobile, isActive: d.isActive } : null,
        attendantId: r.attendantId?.toString() ?? null,
        attendant: a ? { id: a._id.toString(), name: a.name, mobile: a.mobile, isActive: a.isActive } : null,
        morningStart: r.morningStart,
        afternoonStart: r.afternoonStart,
        stops: r.stops.map((s) => ({ name: s.name, pickupTime: s.pickupTime, dropTime: s.dropTime, fee: s.fee })),
        notes: r.notes,
        isActive: r.isActive,
      };
    });
  }

  static async listRoutes(tenantId: string, query: { search?: string; status: "active" | "inactive" | "all" }) {
    const school = asId(tenantId);
    const filter: Record<string, unknown> = { tenantId: school };
    if (query.status !== "all") filter.isActive = query.status === "active";
    if (query.search) {
      const re = new RegExp(escapeRe(query.search), "i");
      filter.$or = [{ name: re }, { "stops.name": re }];
    }
    return { items: await TransportService.routeDtos(school, await TransportRoute.find(filter).sort({ nameKey: 1 }).lean()) };
  }

  static async createRoute(tenantId: string, input: RouteInput) {
    const school = asId(tenantId);
    if ((await TransportRoute.countDocuments({ tenantId: school })) >= MAX_ROUTES) throw ApiError.badRequest(`A school can keep ${MAX_ROUTES} routes.`, "TOO_MANY_ROUTES");
    await TransportService.checkTeam(school, input);
    try {
      const made = await TransportRoute.create({ ...input, tenantId: school, nameKey: keyOf(input.name) });
      return (await TransportService.routeDtos(school, [made.toObject()]))[0];
    } catch (err) {
      throw duplicate(err) ? ROUTE_NAME_TAKEN() : err;
    }
  }

  static async updateRoute(tenantId: string, id: string, input: RouteUpdate) {
    const school = asId(tenantId);
    if (!(await TransportRoute.exists({ _id: id, tenantId: school }))) throw ApiError.notFound("Route not found", "ROUTE_NOT_FOUND");
    await TransportService.checkTeam(school, input);
    const set: Record<string, unknown> = { ...input };
    if (input.name !== undefined) set.nameKey = keyOf(input.name);
    try {
      const saved = await TransportRoute.findOneAndUpdate({ _id: id, tenantId: school }, { $set: set }, { new: true }).lean();
      return (await TransportService.routeDtos(school, [saved!]))[0];
    } catch (err) {
      throw duplicate(err) ? ROUTE_NAME_TAKEN() : err;
    }
  }

  static async deleteRoute(tenantId: string, id: string) {
    const school = asId(tenantId);
    const gone = await TransportRoute.deleteOne({ _id: id, tenantId: school });
    if (gone.deletedCount === 0) throw ApiError.notFound("Route not found", "ROUTE_NOT_FOUND");
  }

  // ---- the numbers on top, and what needs attention ----------------------------------------------------------------------------------
  /** Counts, and every paper (a vehicle's insurance, fitness, PUC, permit; a driver's licence) that has ended or ends within a month. */
  static async summary(tenantId: string) {
    const school = asId(tenantId);
    const [vehicles, crew, routes] = await Promise.all([
      Vehicle.find({ tenantId: school }).lean(),
      CrewMember.find({ tenantId: school }).lean(),
      TransportRoute.find({ tenantId: school }).select("isActive vehicleId driverId stops").lean(),
    ]);
    const attention: { kind: "vehicle" | "driver"; id: string; who: string; what: string; expiry: string; status: "soon" | "expired"; daysLeft: number }[] = [];
    for (const v of vehicles.filter((x) => x.isActive)) {
      for (const d of VEHICLE_DOCUMENTS) {
        const p = paperOf(d.key, d.label, v[d.key]);
        if (p.status === "soon" || p.status === "expired") attention.push({ kind: "vehicle", id: v._id.toString(), who: `${v.number} (${v.registrationNumber})`, what: d.label, expiry: p.expiry!, status: p.status, daysLeft: p.daysLeft! });
      }
    }
    for (const c of crew.filter((x) => x.isActive && x.role === "driver")) {
      const p = paperOf("licenseExpiry", "Licence", c.licenseExpiry);
      if (p.status === "soon" || p.status === "expired") attention.push({ kind: "driver", id: c._id.toString(), who: c.name, what: "Licence", expiry: p.expiry!, status: p.status, daysLeft: p.daysLeft! });
    }
    attention.sort((a, b) => a.daysLeft - b.daysLeft);
    const active = routes.filter((r) => r.isActive);
    return {
      vehicles: { total: vehicles.filter((v) => v.isActive).length, seats: vehicles.filter((v) => v.isActive).reduce((n, v) => n + v.seats, 0), inactive: vehicles.filter((v) => !v.isActive).length },
      drivers: { total: crew.filter((c) => c.isActive && c.role === "driver").length, attendants: crew.filter((c) => c.isActive && c.role === "attendant").length },
      routes: { total: active.length, stops: active.reduce((n, r) => n + r.stops.length, 0), withoutVehicle: active.filter((r) => !r.vehicleId).length, withoutDriver: active.filter((r) => !r.driverId).length },
      attention: attention.slice(0, 30),
      attentionCount: attention.length,
    };
  }
}
