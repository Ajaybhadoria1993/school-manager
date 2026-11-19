import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { AcademicYearService } from "../../academics/services/academicYear.service";
import { Student } from "../../students/models/Student";
import { fullName, placeTitle, placesOf } from "../../students/services/shared";
import { CrewMember } from "../models/CrewMember";
import { RouteRider } from "../models/RouteRider";
import { TransportRoute, type ITransportRoute } from "../models/TransportRoute";
import { Vehicle } from "../models/Vehicle";
import { VehiclePosition } from "../models/VehiclePosition";
import { positionDto } from "./tracking.service";

const asId = (id: string | Types.ObjectId) => new Types.ObjectId(id.toString());
const keyOf = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ROUTE_NOT_FOUND = () => ApiError.notFound("Route not found", "ROUTE_NOT_FOUND");
const SEARCH_LIMIT = 15;

/** What a parent learns of their child's bus. Where the vehicle is comes only while it is live: its parking place at night is nobody's business. */
export interface ChildBusDto {
  assigned: boolean;
  route?: { name: string; morningStart: string | null; afternoonStart: string | null };
  stop?: { name: string; pickupTime: string | null; dropTime: string | null; fee: number | null } | null;
  vehicle?: { number: string; registrationNumber: string } | null;
  driver?: { name: string; mobile: string } | null;
  attendant?: { name: string; mobile: string } | null;
  tracking?: {
    /** The vehicle has a driver link, so it can be followed at all. */
    enabled: boolean;
    /** Where it is now; null unless it is live. */
    live: { lat: number; lng: number; speedKmph: number | null; heading: number | null; recordedAt: string; ageSeconds: number } | null;
    /** Seconds since it last reported, for "last seen 3 hours ago"; null when it never did. */
    lastSeenSeconds: number | null;
  };
}

/**
 * Active students of a school matching what is typed: each word must be in the first name, last name or admission number (typed letters are
 * letters, not a pattern). At most a few at once, with their class this year. Used wherever a person picks a student to work on (a route's
 * riders, a fee account).
 */
export async function findStudents(school: Types.ObjectId, q: string): Promise<{ id: string; name: string; admissionNumber: string; classLabel: string | null }[]> {
  const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 4);
  if (words.length === 0) return [];
  const filter = { tenantId: school, status: "active", $and: words.map((w) => ({ $or: ["firstName", "lastName", "admissionNumber"].map((f) => ({ [f]: new RegExp(escapeRe(w), "i") })) })) };
  const students = await Student.find(filter).select("firstName lastName admissionNumber").sort({ firstName: 1, lastName: 1 }).limit(SEARCH_LIMIT).lean();
  const yearId = await AcademicYearService.activeYearId(school);
  const places = await placesOf(school, yearId, students.map((s) => s._id));
  return students.map((s) => {
    const place = places.get(s._id.toString());
    return { id: s._id.toString(), name: fullName(s), admissionNumber: s.admissionNumber, classLabel: place ? placeTitle(place.className, place.sectionName) : null };
  });
}

/**
 * Which students ride which route, and the parent's view of their own child's bus (docs/transport.md). The school's transport in-charge
 * adds a student to a route with the stop they board at; a student has one bus, so adding them again moves them.
 */
export class RiderService {
  private static async routeOf(school: Types.ObjectId, routeId: string) {
    const route = Types.ObjectId.isValid(routeId) ? await TransportRoute.findOne({ _id: routeId, tenantId: school }).lean() : null;
    if (!route) throw ROUTE_NOT_FOUND();
    return route;
  }

  private static stopOf(route: Pick<ITransportRoute, "stops">, name: string) {
    const key = keyOf(name);
    return route.stops.find((s) => keyOf(s.name) === key) ?? null;
  }

  /** The route's riders who are still students of the school (a child who left no longer rides). */
  private static async activeRiders(school: Types.ObjectId, routeIds: Types.ObjectId[]) {
    const riders = await RouteRider.find({ tenantId: school, routeId: { $in: routeIds } }).lean();
    if (riders.length === 0) return [];
    const students = await Student.find({ tenantId: school, status: "active", _id: { $in: riders.map((r) => r.studentId) } })
      .select("firstName lastName admissionNumber")
      .lean();
    const byId = new Map(students.map((s) => [s._id.toString(), s]));
    return riders.flatMap((r) => (byId.has(r.studentId.toString()) ? [{ rider: r, student: byId.get(r.studentId.toString())! }] : []));
  }

  /** How many students ride each route (for the routes list). */
  static async countByRoute(school: Types.ObjectId, routeIds: Types.ObjectId[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const { rider } of await RiderService.activeRiders(school, routeIds)) counts.set(rider.routeId.toString(), (counts.get(rider.routeId.toString()) ?? 0) + 1);
    return counts;
  }

  /** The students of a route, with the stop each boards at, by name. */
  static async list(tenantId: string, routeId: string) {
    const school = asId(tenantId);
    const route = await RiderService.routeOf(school, routeId);
    const [rows, yearId, vehicle] = await Promise.all([
      RiderService.activeRiders(school, [route._id]),
      AcademicYearService.activeYearId(school),
      route.vehicleId ? Vehicle.findOne({ _id: route.vehicleId, tenantId: school }).select("seats").lean() : null,
    ]);
    const places = await placesOf(school, yearId, rows.map((r) => r.student._id));
    const items = rows
      .map(({ rider, student }) => {
        const place = places.get(student._id.toString());
        return {
          studentId: student._id.toString(),
          name: fullName(student),
          admissionNumber: student.admissionNumber,
          classLabel: place ? placeTitle(place.className, place.sectionName) : null,
          stopName: rider.stopName,
          /** False when the stop was renamed or taken off the route since. */
          stopKnown: RiderService.stopOf(route, rider.stopName) !== null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return { route: { id: route._id.toString(), name: route.name, isActive: route.isActive, stops: route.stops.map((s) => s.name) }, seats: vehicle?.seats ?? null, items };
  }

  /** Puts a student on a route at a stop of it, taking them off the bus they were on. */
  static async add(tenantId: string, routeId: string, input: { studentId: string; stopName: string }) {
    const school = asId(tenantId);
    const route = await RiderService.routeOf(school, routeId);
    if (!route.isActive) throw ApiError.conflict("This route is closed. Open it first, or choose another route.", "ROUTE_CLOSED");
    const student = Types.ObjectId.isValid(input.studentId) ? await Student.findOne({ _id: input.studentId, tenantId: school, status: "active" }).select("_id").lean() : null;
    if (!student) throw ApiError.badRequest("Choose a student of your school", "STUDENT_NOT_FOUND", [{ path: "studentId", message: "Choose a student of your school" }]);
    const stop = RiderService.stopOf(route, input.stopName);
    if (!stop) throw ApiError.badRequest("Choose one of the stops of this route", "STOP_NOT_FOUND", [{ path: "stopName", message: "Choose one of the stops of this route" }]);
    const save = () => RouteRider.findOneAndUpdate({ tenantId: school, studentId: student._id }, { $set: { routeId: route._id, stopName: stop.name } }, { upsert: true, new: true });
    // Two adds of the same student at once can both try to make the row: the unique index lets one win, the other just updates it.
    await save().catch((err) => ((err as { code?: number }).code === 11000 ? save() : Promise.reject(err)));
    return RiderService.list(tenantId, routeId);
  }

  static async remove(tenantId: string, routeId: string, studentId: string) {
    const school = asId(tenantId);
    await RiderService.routeOf(school, routeId);
    const gone = Types.ObjectId.isValid(studentId) ? await RouteRider.deleteOne({ tenantId: school, routeId, studentId }) : { deletedCount: 0 };
    if (gone.deletedCount === 0) throw ApiError.notFound("This student is not on this route", "RIDER_NOT_FOUND");
    return RiderService.list(tenantId, routeId);
  }

  /** A route that is deleted takes its riders off. */
  static async clearRoute(school: Types.ObjectId, routeId: Types.ObjectId) {
    await RouteRider.deleteMany({ tenantId: school, routeId });
  }

  /** Students to choose from: by name or admission number, each word of what is typed must be in one of them. Their class and bus are said so the right child is picked. */
  static async searchStudents(tenantId: string, q: string) {
    const school = asId(tenantId);
    const found = await findStudents(school, q);
    if (found.length === 0) return { items: [] };
    const riders = await RouteRider.find({ tenantId: school, studentId: { $in: found.map((s) => asId(s.id)) } }).lean();
    const routes = await TransportRoute.find({ tenantId: school, _id: { $in: riders.map((r) => r.routeId) } }).select("name").lean();
    const routeName = new Map(routes.map((r) => [r._id.toString(), r.name]));
    const rideOf = new Map(riders.map((r) => [r.studentId.toString(), routeName.get(r.routeId.toString()) ?? null]));
    // The route they already ride; adding them to another moves them.
    return { items: found.map((s) => ({ ...s, route: rideOf.get(s.id) ?? null })) };
  }

  /** The bus of one child, for the child's parent (the caller has already proved the child is theirs: ParentService.childOf). */
  static async forChild(tenantId: string, studentId: string): Promise<ChildBusDto> {
    const school = asId(tenantId);
    const rider = await RouteRider.findOne({ tenantId: school, studentId: asId(studentId) }).lean();
    const route = rider ? await TransportRoute.findOne({ _id: rider.routeId, tenantId: school, isActive: true }).lean() : null;
    if (!rider || !route) return { assigned: false };
    const [vehicle, people] = await Promise.all([
      route.vehicleId ? Vehicle.findOne({ _id: route.vehicleId, tenantId: school, isActive: true }).select("number registrationNumber trackingKeyAt").lean() : null,
      CrewMember.find({ tenantId: school, _id: { $in: [route.driverId, route.attendantId].filter((id): id is Types.ObjectId => !!id) } }).select("name mobile").lean(),
    ]);
    const person = (id: Types.ObjectId | null) => {
      const p = id ? people.find((x) => x._id.equals(id)) : undefined;
      return p ? { name: p.name, mobile: p.mobile } : null;
    };
    const enabled = !!vehicle && vehicle.trackingKeyAt != null;
    const last = enabled ? await VehiclePosition.findOne({ tenantId: school, vehicleId: vehicle!._id }).lean() : null;
    const seen = last ? positionDto(last) : null;
    const stop = RiderService.stopOf(route, rider.stopName);
    return {
      assigned: true,
      route: { name: route.name, morningStart: route.morningStart, afternoonStart: route.afternoonStart },
      stop: stop ? { name: stop.name, pickupTime: stop.pickupTime, dropTime: stop.dropTime, fee: stop.fee } : null,
      vehicle: vehicle ? { number: vehicle.number, registrationNumber: vehicle.registrationNumber } : null,
      driver: person(route.driverId),
      attendant: person(route.attendantId),
      tracking: {
        enabled,
        live: seen && seen.status === "live" ? { lat: seen.lat, lng: seen.lng, speedKmph: seen.speedKmph, heading: seen.heading, recordedAt: seen.recordedAt, ageSeconds: seen.ageSeconds } : null,
        lastSeenSeconds: seen ? seen.ageSeconds : null,
      },
    };
  }
}
