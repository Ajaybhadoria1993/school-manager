import { Router } from "express";
import { requireAuth } from "../../../../middleware/auth";
import { requireSchoolPermission } from "../../../../middleware/permission";
import { validate } from "../../../../middleware/validate";
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
  createCrewSchema,
  createRouteSchema,
  createVehicleSchema,
  idParamSchema,
  listCrewQuerySchema,
  listRoutesQuerySchema,
  listVehiclesQuerySchema,
  updateCrewSchema,
  updateRouteSchema,
  updateVehicleSchema,
} from "../../schemas/transport.schemas";

/**
 * `/api/v1/transport`: the school's vehicles, the drivers and attendants, and the routes with their stops. Who may look and who may
 * change follows the school's Permissions (transport.view / transport.manage); a teacher or a parent never reaches these pages.
 */
const router = Router();

router.use(requireAuth);

const see = requireSchoolPermission("transport.view");
const change = requireSchoolPermission("transport.manage");

router.get("/summary", see, getSummary);

router.get("/vehicles", see, validate(listVehiclesQuerySchema, "query"), listVehicles);
router.post("/vehicles", change, validate(createVehicleSchema), createVehicle);
router.patch("/vehicles/:id", change, validate(idParamSchema, "params"), validate(updateVehicleSchema), updateVehicle);
router.delete("/vehicles/:id", change, validate(idParamSchema, "params"), deleteVehicle);

router.get("/drivers", see, validate(listCrewQuerySchema, "query"), listCrew);
router.post("/drivers", change, validate(createCrewSchema), createCrew);
router.patch("/drivers/:id", change, validate(idParamSchema, "params"), validate(updateCrewSchema), updateCrew);
router.delete("/drivers/:id", change, validate(idParamSchema, "params"), deleteCrew);

router.get("/routes", see, validate(listRoutesQuerySchema, "query"), listRoutes);
router.post("/routes", change, validate(createRouteSchema), createRoute);
router.patch("/routes/:id", change, validate(idParamSchema, "params"), validate(updateRouteSchema), updateRoute);
router.delete("/routes/:id", change, validate(idParamSchema, "params"), deleteRoute);

export default router;
