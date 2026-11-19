import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { MAX_NAME, MAX_NOTES } from "../constants";

/** One stop of a route, in the order the vehicle reaches it. Times are "HH:MM" (24 hours) or null. */
export interface IStop {
  name: string;
  pickupTime: string | null;
  dropTime: string | null;
  /** The monthly transport fee for a child who boards here (rupees), when it differs by stop. */
  fee: number | null;
}

/**
 * A route: the stops in order, when it starts in the morning and in the afternoon, and who runs it (a vehicle, a driver, an attendant:
 * each may be missing while the school decides). A vehicle or a person may be on more than one route (a morning and an evening one).
 */
export interface ITransportRoute {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  nameKey: string;
  vehicleId: Types.ObjectId | null;
  driverId: Types.ObjectId | null;
  attendantId: Types.ObjectId | null;
  /** When the vehicle leaves its first stop to bring the children to school. */
  morningStart: string | null;
  /** When it leaves the school with the children after the day. */
  afternoonStart: string | null;
  stops: IStop[];
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const stopSchema = new Schema<IStop>(
  {
    name: { type: String, required: true, trim: true, maxlength: MAX_NAME },
    pickupTime: { type: String, default: null },
    dropTime: { type: String, default: null },
    fee: { type: Number, default: null, min: 0 },
  },
  { _id: false }
);

const routeSchema = new Schema<ITransportRoute>(
  {
    name: { type: String, required: true, trim: true, maxlength: MAX_NAME },
    nameKey: { type: String, required: true },
    vehicleId: { type: Schema.Types.ObjectId, ref: "Vehicle", default: null },
    driverId: { type: Schema.Types.ObjectId, ref: "CrewMember", default: null },
    attendantId: { type: Schema.Types.ObjectId, ref: "CrewMember", default: null },
    morningStart: { type: String, default: null },
    afternoonStart: { type: String, default: null },
    stops: { type: [stopSchema], default: [] },
    notes: { type: String, default: null, trim: true, maxlength: MAX_NOTES },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

routeSchema.plugin(tenantScope);
routeSchema.index({ tenantId: 1, nameKey: 1 }, { unique: true, name: "one_route_per_name" });
routeSchema.index({ tenantId: 1, vehicleId: 1 });

export const TransportRoute = model<ITransportRoute>("TransportRoute", routeSchema);
