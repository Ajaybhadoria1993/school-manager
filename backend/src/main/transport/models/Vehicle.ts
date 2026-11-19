import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { MAX_NAME, MAX_NOTES, VEHICLE_TYPES, type VehicleType } from "../constants";

/**
 * One vehicle of the school. `number` is the school's own name for it ("Bus 1", "Van 3"); `registrationNumber` is the one on its plate
 * ("MP09 AB 1234"). The last day of each paper is a calendar day, "2027-03-31" (or null: not given). Never deleted once it is on a route:
 * it is made inactive.
 */
export interface IVehicle {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  number: string;
  /** Lower-cased, single-spaced: "bus 1" and "Bus  1" are the same vehicle. */
  numberKey: string;
  registrationNumber: string;
  /** The plate without spaces and dashes, upper case: how two spellings of it are told to be the same. */
  registrationKey: string;
  type: VehicleType;
  seats: number;
  /** "Tata Starbus", "Force Traveller". */
  model: string | null;
  insuranceExpiry: string | null;
  fitnessExpiry: string | null;
  pollutionExpiry: string | null;
  permitExpiry: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const vehicleSchema = new Schema<IVehicle>(
  {
    number: { type: String, required: true, trim: true, maxlength: MAX_NAME },
    numberKey: { type: String, required: true },
    registrationNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    registrationKey: { type: String, required: true },
    type: { type: String, enum: VEHICLE_TYPES, required: true, default: "bus" },
    seats: { type: Number, required: true, min: 1 },
    model: { type: String, default: null, trim: true, maxlength: MAX_NAME },
    insuranceExpiry: { type: String, default: null },
    fitnessExpiry: { type: String, default: null },
    pollutionExpiry: { type: String, default: null },
    permitExpiry: { type: String, default: null },
    notes: { type: String, default: null, trim: true, maxlength: MAX_NOTES },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

vehicleSchema.plugin(tenantScope);
vehicleSchema.index({ tenantId: 1, numberKey: 1 }, { unique: true, name: "one_vehicle_per_number" });
vehicleSchema.index({ tenantId: 1, registrationKey: 1 }, { unique: true, name: "one_vehicle_per_plate" });

export const Vehicle = model<IVehicle>("Vehicle", vehicleSchema);
