import { Router } from "express";
import { requireAuth, requireRole } from "../../../../middleware/auth";
import { requirePermission } from "../../../../middleware/permission";
import { validate } from "../../../../middleware/validate";
import { createRole, deleteRole, getPermissions, listRoles, resetPermissions, savePermissions } from "../../controllers/permissions.controller";
import { createRoleSchema, profileParamSchema, savePermissionsSchema } from "../../schemas/permissions.schemas";

/**
 * `/api/v1/permissions`: what each kind of person of the school (Receptionist, Teacher, Parent, a role the school made...) may do. The people who
 * run the school read it; only the school admin changes it, and makes or deletes a role of the school's own (2026-11-26).
 */
const router = Router();

router.use(requireAuth);

router.get("/", requireRole("school_admin", "principal"), getPermissions);
// The roles the school named, for Add staff's Role list: whoever adds or changes the staff (fixed paths before "/:profile").
router.get("/roles", requirePermission("staff.view", "staff.add", "staff.edit"), listRoles);
router.post("/roles", requireRole("school_admin"), validate(createRoleSchema), createRole);
router.delete("/roles/:profile", requireRole("school_admin"), validate(profileParamSchema, "params"), deleteRole);
router.put("/:profile", requireRole("school_admin"), validate(profileParamSchema, "params"), validate(savePermissionsSchema), savePermissions);
router.delete("/:profile", requireRole("school_admin"), validate(profileParamSchema, "params"), resetPermissions);

export default router;
