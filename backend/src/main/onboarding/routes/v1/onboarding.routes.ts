import { Router } from "express";
import { requireAuthLoose, requireRole } from "../../../../middleware/auth";
import { validate } from "../../../../middleware/validate";
import { logoFile } from "../../../../middleware/uploadLogo";
import { getOnboarding, removeLogo, saveLogo, saveStep, submitOnboarding, updateSchoolProfile } from "../../controllers/onboarding.controller";
import { step1Schema, stepParamSchema } from "../../schemas/onboarding.schemas";

const router = Router();

// Loose: these are exactly the routes a school needs BEFORE it is approved.
router.use(requireAuthLoose, requireRole("school_admin"));

router.get("/", getOnboarding);
router.put("/steps/:step", validate(stepParamSchema, "params"), saveStep);
// An approved school's admin can update its public details without reopening onboarding or changing approval progress.
router.put("/profile", validate(step1Schema), updateSchoolProfile);
router.put("/logo", logoFile, saveLogo);
router.delete("/logo", removeLogo);
router.post("/submit", submitOnboarding);

export default router;
