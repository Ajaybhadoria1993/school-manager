import { Router } from "express";
import { requireAuth, requireSuperAdmin } from "../../../../middleware/auth";
import { inviteLimiter } from "../../../../middleware/rateLimit";
import { validate } from "../../../../middleware/validate";
import {
  approveSchool,
  getCounts,
  getOverview,
  getReview,
  inviteSchool,
  listTenants,
  reactivateSchool,
  rejectSchool,
  resendInvite,
  suspendSchool,
} from "../../controllers/tenants.controller";
import {
  approveSchema,
  inviteSchoolSchema,
  listTenantsQuerySchema,
  reactivateSchema,
  rejectSchema,
  suspendSchema,
  tenantIdParamSchema,
} from "../../schemas/tenants.schemas";

const router = Router();

// Everything here is for the platform owner only.
router.use(requireAuth, requireSuperAdmin);

router.get("/", validate(listTenantsQuerySchema, "query"), listTenants);
// Fixed paths first: otherwise "/:id" would swallow them.
router.get("/counts", getCounts);
router.get("/overview", getOverview);
router.post("/invite", inviteLimiter, validate(inviteSchoolSchema), inviteSchool);

router.get("/:id/review", validate(tenantIdParamSchema, "params"), getReview);
router.post("/:id/resend-invite", inviteLimiter, validate(tenantIdParamSchema, "params"), resendInvite);
router.post("/:id/approve", validate(tenantIdParamSchema, "params"), validate(approveSchema), approveSchool);
router.post("/:id/reject", validate(tenantIdParamSchema, "params"), validate(rejectSchema), rejectSchool);
router.post("/:id/suspend", validate(tenantIdParamSchema, "params"), validate(suspendSchema), suspendSchool);
router.post("/:id/reactivate", validate(tenantIdParamSchema, "params"), validate(reactivateSchema), reactivateSchool);

export default router;
