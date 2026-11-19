import { Router } from "express";
import { requireAuth } from "../../../../middleware/auth";
import { trackingPingLimiter } from "../../../../middleware/rateLimit";
import { requireSchoolPermission } from "../../../../middleware/permission";
import { validate } from "../../../../middleware/validate";
import { addRider, listRiders, removeRider, searchStudents } from "../../controllers/riders.controller";
import { driverPing, driverSession, driverStop, getLive, issueKey, revokeKey } from "../../controllers/tracking.controller";
import {
  createCrew,
  createRoute,
  createVehicle,
  deleteCrew,
  deleteRoute,
  deleteVehicle,
  getSummary,
  listCrew,
  listRoutes,
  listVehicles,
  updateCrew,
  updateRoute,
  updateVehicle,
} from "../../controllers/transport.controller";
import {
  addRiderSchema,
  createCrewSchema,
  createRouteSchema,
  createVehicleSchema,
  idParamSchema,
  listCrewQuerySchema,
  listRoutesQuerySchema,
  listVehiclesQuerySchema,
  pingSchema,
  riderParamsSchema,
  searchStudentsQuerySchema,
  updateCrewSchema,
  updateRouteSchema,
  updateVehicleSchema,
} from "../../schemas/transport.schemas";

/**
 * `/api/v1/transport`: the school's vehicles, the drivers and attendants, and the routes with their stops. Who may look and who may
 * change follows the school's Permissions (transport.view / transport.manage); a teacher or a parent never reaches these pages.
 */
const router = Router();

// The driver's phone has no sign-in: its private link (the X-Tracking-Link header) is checked inside, so these come BEFORE requireAuth.
router.post("/tracking/session", trackingPingLimiter, driverSession);
router.post("/tracking/ping", trackingPingLimiter, validate(pingSchema), driverPing);
router.post("/tracking/stop", trackingPingLimiter, driverStop);

router.use(requireAuth);

const see = requireSchoolPermission("transport.view");
const change = requireSchoolPermission("transport.manage");

router.get("/summary", see, getSummary);

router.get("/vehicles", see, validate(listVehiclesQuerySchema, "query"), listVehicles);
router.post("/vehicles", change, validate(createVehicleSchema), createVehicle);
router.patch("/vehicles/:id", change, validate(idParamSchema, "params"), validate(updateVehicleSchema), updateVehicle);
router.delete("/vehicles/:id", change, validate(idParamSchema, "params"), deleteVehicle);

router.post("/vehicles/:id/tracking-key", change, validate(idParamSchema, "params"), issueKey);
router.delete("/vehicles/:id/tracking-key", change, validate(idParamSchema, "params"), revokeKey);
router.get("/tracking/live", see, getLive);

router.get("/drivers", see, validate(listCrewQuerySchema, "query"), listCrew);
router.post("/drivers", change, validate(createCrewSchema), createCrew);
router.patch("/drivers/:id", change, validate(idParamSchema, "params"), validate(updateCrewSchema), updateCrew);
router.delete("/drivers/:id", change, validate(idParamSchema, "params"), deleteCrew);

router.get("/routes", see, validate(listRoutesQuerySchema, "query"), listRoutes);
router.post("/routes", change, validate(createRouteSchema), createRoute);
router.patch("/routes/:id", change, validate(idParamSchema, "params"), validate(updateRouteSchema), updateRoute);
router.delete("/routes/:id", change, validate(idParamSchema, "params"), deleteRoute);

// Which students ride a route and where they board. Seeing the students is part of changing who rides, so all of it is `transport.manage`.
router.get("/routes/:id/riders", change, validate(idParamSchema, "params"), listRiders);
router.post("/routes/:id/riders", change, validate(idParamSchema, "params"), validate(addRiderSchema), addRider);
router.delete("/routes/:id/riders/:studentId", change, validate(riderParamsSchema, "params"), removeRider);
router.get("/students/search", change, validate(searchStudentsQuerySchema, "query"), searchStudents);

export default router;
