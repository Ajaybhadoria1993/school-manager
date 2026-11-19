import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { POSITION_KEEP_DAYS } from "../constants";

/**
 * Where a vehicle was last seen: ONE row per vehicle, replaced by each ping from the driver's phone (the map needs only the latest; the
 * trail is not kept). `isLive` is false once the driver ends the trip; a row that has also gone quiet for a month is removed by MongoDB.
 */
export interface IVehiclePosition {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  vehicleId: Types.ObjectId;
  lat: number;
  lng: number;
  /** Kilometres per hour; null when the phone could not tell. */
  speedKmph: number | null;
  /** Degrees clockwise from north, 0 to 359; null when standing still or unknown. */
  heading: number | null;
  /** The phone's own estimate of how far off the point may be, in metres. */
  accuracy: number | null;
  /** When the server received it (the phone's clock is not trusted). */
  recordedAt: Date;
  isLive: boolean;
}

const positionSchema = new Schema<IVehiclePosition>({
  vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle", required: true },
  lat: { type: Number, required: true, min: -90, max: 90 },
  lng: { type: Number, required: true, min: -180, max: 180 },
  speedKmph: { type: Number, default: null, min: 0 },
  heading: { type: Number, default: null, min: 0, max: 360 },
  accuracy: { type: Number, default: null, min: 0 },
  recordedAt: { type: Date, required: true },
  isLive: { type: Boolean, default: true },
});

positionSchema.plugin(tenantScope);
positionSchema.index({ tenantId: 1, vehicleId: 1 }, { unique: true, name: "one_position_per_vehicle" });
positionSchema.index({ recordedAt: 1 }, { expireAfterSeconds: POSITION_KEEP_DAYS * 86_400, name: "forget_quiet_vehicles" });

export const VehiclePosition = model<IVehiclePosition>("VehiclePosition", positionSchema);
