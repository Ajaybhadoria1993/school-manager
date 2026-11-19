import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { MAX_NAME } from "../constants";

/**
 * A student who rides a school route and the stop they board at. A student has ONE bus: giving them another moves them. It has no
 * academic year on purpose (listed in YEAR_FREE_MODELS): a child keeps their bus and stop from one session to the next until the school
 * changes it, like the routes themselves. The stop is kept by its name (a route's stops carry no id) and is read back against the route:
 * a stop renamed or taken away leaves the child on the route with no stop until the school chooses one again.
 */
export interface IRouteRider {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  studentId: Types.ObjectId;
  routeId: Types.ObjectId;
  stopName: string;
  createdAt: Date;
  updatedAt: Date;
}

const riderSchema = new Schema<IRouteRider>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, immutable: true },
    routeId: { type: Schema.Types.ObjectId, ref: "TransportRoute", required: true },
    stopName: { type: String, required: true, trim: true, maxlength: MAX_NAME },
  },
  { timestamps: true }
);

riderSchema.plugin(tenantScope);
riderSchema.index({ tenantId: 1, studentId: 1 }, { unique: true, name: "one_bus_per_student" });
riderSchema.index({ tenantId: 1, routeId: 1 });

export const RouteRider = model<IRouteRider>("RouteRider", riderSchema);
