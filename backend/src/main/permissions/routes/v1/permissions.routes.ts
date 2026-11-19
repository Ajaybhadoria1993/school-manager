import { Router } from "express";
import { requireAuth, requireRole } from "../../../../middleware/auth";
import { validate } from "../../../../middleware/validate";
import { getPermissions, resetPermissions, savePermissions } from "../../controllers/permissions.controller";
import { profileParamSchema, savePermissionsSchema } from "../../schemas/permissions.schemas";

/**
 * `/api/v1/permissions`: what each kind of person of the school (Receptionist, Teacher, Parent...) may do. The people who run the school
 * read it; only the school admin changes it.
 */
const router = Router();

router.use(requireAuth);

router.get("/", requireRole("school_admin", "principal"), getPermissions);
router.put("/:profile", requireRole("school_admin"), validate(profileParamSchema, "params"), validate(savePermissionsSchema), savePermissions);
router.delete("/:profile", requireRole("school_admin"), validate(profileParamSchema, "params"), resetPermissions);

export default router;
