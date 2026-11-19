import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { pushToTracking } from "../../../realtime/socket";
import { ALL_TENANTS } from "../../tenants/plugins/tenantScope";
import { LIVE_WITHIN_SECONDS } from "../constants";
import { CrewMember } from "../models/CrewMember";
import { TransportRoute } from "../models/TransportRoute";
import { Vehicle } from "../models/Vehicle";
import { VehiclePosition, type IVehiclePosition } from "../models/VehiclePosition";
import type { PingInput } from "../schemas/transport.schemas";

const asId = (id: string | Types.ObjectId) => new Types.ObjectId(id.toString());
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const OBJECT_ID = /^[a-f\d]{24}$/i;
const KEY_INVALID = () => ApiError.unauthorized("This tracking link is not valid any more. Ask the school for a new one.", "TRACKING_KEY_INVALID");

export type PositionStatus = "live" | "offline";

/** A vehicle's last position as the map needs it. "live" while it reported within LIVE_WITHIN_SECONDS of a trip that has not ended. */
export function positionDto(p: Pick<IVehiclePosition, "lat" | "lng" | "speedKmph" | "heading" | "accuracy" | "recordedAt" | "isLive">, now = new Date()) {
  const ageSeconds = Math.max(0, Math.round((now.getTime() - p.recordedAt.getTime()) / 1000));
  const status: PositionStatus = p.isLive && ageSeconds <= LIVE_WITHIN_SECONDS ? "live" : "offline";
  return { lat: p.lat, lng: p.lng, speedKmph: p.speedKmph, heading: p.heading, accuracy: p.accuracy, recordedAt: p.recordedAt.toISOString(), ageSeconds, status };
}

/**
 * Live tracking: the driver's phone sends its position (`ping`), the office reads every vehicle's last one (`live`) and gets each new one on the
 * socket. The driver has no login: each vehicle has a private link, `<vehicleId>.<secret>`; only the secret's SHA-256 is kept, and a new link
 * replaces the old one.
 */
export class TrackingService {
  // ---- the driver's link --------------------------------------------------------------------------------------------------------------
  /** Makes (or replaces) the vehicle's driver link. The secret is shown this once: the school keeps only its hash. */
  static async issueKey(tenantId: string, vehicleId: string) {
    const school = asId(tenantId);
    const secret = randomBytes(24).toString("base64url");
    const done = await Vehicle.updateOne({ _id: vehicleId, tenantId: school }, { $set: { trackingKeyHash: sha256(secret), trackingKeyAt: new Date() } });
    if (done.matchedCount === 0) throw ApiError.notFound("Vehicle not found", "VEHICLE_NOT_FOUND");
    return { key: `${vehicleId}.${secret}` };
  }

  /** Switches the link off (a lost phone, a driver who left): pings with it are refused from now on. */
  static async revokeKey(tenantId: string, vehicleId: string) {
    const school = asId(tenantId);
    const done = await Vehicle.updateOne({ _id: vehicleId, tenantId: school }, { $set: { trackingKeyHash: null, trackingKeyAt: null } });
    if (done.matchedCount === 0) throw ApiError.notFound("Vehicle not found", "VEHICLE_NOT_FOUND");
    await TrackingService.goOffline(school, asId(vehicleId));
  }

  /**
   * Which vehicle a link is for. This is the one place that looks a vehicle up before knowing its school (the phone knows only the link), so it
   * opts out of the school filter on purpose and takes the school from the vehicle it finds. Every failure gives the same answer.
   */
  static async vehicleFromKey(token: string | null | undefined) {
    const [id, secret, ...extra] = (token ?? "").split(".");
    if (!id || !secret || extra.length > 0 || !OBJECT_ID.test(id)) throw KEY_INVALID();
    const vehicle = await Vehicle.findOne({ _id: id }).select("+trackingKeyHash tenantId number registrationNumber isActive").setOptions(ALL_TENANTS).lean();
    if (!vehicle?.trackingKeyHash || !vehicle.isActive) throw KEY_INVALID();
    const given = Buffer.from(sha256(secret), "hex");
    const kept = Buffer.from(vehicle.trackingKeyHash, "hex");
    if (given.length !== kept.length || !timingSafeEqual(given, kept)) throw KEY_INVALID();
    return vehicle;
  }

  /** What the driver's page shows once the link is accepted: which vehicle this phone is, and its routes. */
  static async session(token: string | null | undefined) {
    const vehicle = await TrackingService.vehicleFromKey(token);
    const routes = await TransportRoute.find({ tenantId: vehicle.tenantId, vehicleId: vehicle._id, isActive: true }).select("name").sort({ name: 1 }).lean();
    return { vehicle: { id: vehicle._id.toString(), number: vehicle.number, registrationNumber: vehicle.registrationNumber }, routes: routes.map((r) => r.name) };
  }

  // ---- positions ----------------------------------------------------------------------------------------------------------------------
  /** Keeps the phone's position as the vehicle's latest and tells the school's open maps. */
  static async ping(token: string | null | undefined, input: PingInput) {
    const vehicle = await TrackingService.vehicleFromKey(token);
    const filter = { tenantId: vehicle.tenantId, vehicleId: vehicle._id };
    const set = { lat: input.lat, lng: input.lng, speedKmph: input.speedKmph, heading: input.heading, accuracy: input.accuracy, recordedAt: new Date(), isLive: true };
    const save = () => VehiclePosition.findOneAndUpdate(filter, { $set: set }, { upsert: true, new: true }).lean();
    // Two first pings at once can both try to add the vehicle's row: the unique index lets one win, the other just updates it.
    const saved = await save().catch((err) => ((err as { code?: number }).code === 11000 ? save() : Promise.reject(err)));
    pushToTracking(vehicle.tenantId.toString(), "vehicle:position", { vehicleId: vehicle._id.toString(), position: positionDto(saved!) });
  }

  /** The driver ends the trip: the vehicle shows as offline at once, not after two quiet minutes. */
  static async stop(token: string | null | undefined) {
    const vehicle = await TrackingService.vehicleFromKey(token);
    await TrackingService.goOffline(vehicle.tenantId, vehicle._id);
  }

  private static async goOffline(school: Types.ObjectId, vehicleId: Types.ObjectId) {
    const saved = await VehiclePosition.findOneAndUpdate({ tenantId: school, vehicleId }, { $set: { isLive: false } }, { new: true }).lean();
    if (saved) pushToTracking(school.toString(), "vehicle:position", { vehicleId: vehicleId.toString(), position: positionDto(saved) });
  }

  /** Every vehicle of the school that has a driver link, with its last position (null while it has never reported) and who runs it. */
  static async live(tenantId: string) {
    const school = asId(tenantId);
    const [positions, vehicles] = await Promise.all([
      VehiclePosition.find({ tenantId: school }).lean(),
      Vehicle.find({ tenantId: school, isActive: true, trackingKeyAt: { $ne: null } }).select("number registrationNumber type").sort({ number: 1 }).lean(),
    ]);
    const byVehicle = new Map(positions.map((p) => [p.vehicleId.toString(), p]));
    const ids = vehicles.map((v) => v._id);
    const routes = ids.length ? await TransportRoute.find({ tenantId: school, isActive: true, vehicleId: { $in: ids } }).select("name vehicleId driverId").sort({ name: 1 }).lean() : [];
    const driverIds = [...new Set(routes.map((r) => r.driverId?.toString()).filter((d): d is string => !!d))].map(asId);
    const drivers = driverIds.length ? await CrewMember.find({ tenantId: school, _id: { $in: driverIds } }).select("name mobile").lean() : [];
    const driverOf = new Map(drivers.map((d) => [d._id.toString(), { name: d.name, mobile: d.mobile }]));
    const now = new Date();
    return {
      liveWithinSeconds: LIVE_WITHIN_SECONDS,
      items: vehicles.map((v) => {
        const mine = routes.filter((r) => r.vehicleId?.toString() === v._id.toString());
        const driverId = mine.find((r) => r.driverId)?.driverId?.toString();
        const p = byVehicle.get(v._id.toString());
        return {
          vehicleId: v._id.toString(),
          number: v.number,
          registrationNumber: v.registrationNumber,
          type: v.type,
          routes: mine.map((r) => r.name),
          driver: driverId ? (driverOf.get(driverId) ?? null) : null,
          position: p ? positionDto(p, now) : null,
        };
      }),
    };
  }
}
