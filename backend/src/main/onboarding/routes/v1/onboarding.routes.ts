import { Router } from "express";
import { requireAuthLoose, requireRole } from "../../../../middleware/auth";
import { validate } from "../../../../middleware/validate";
import { getOnboarding, saveStep, submitOnboarding } from "../../controllers/onboarding.controller";
import { stepParamSchema } from "../../schemas/onboarding.schemas";

const router = Router();

// Loose: these are exactly the routes a school needs BEFORE it is approved.
router.use(requireAuthLoose, requireRole("school_admin"));

router.get("/", getOnboarding);
router.put("/steps/:step", validate(stepParamSchema, "params"), saveStep);
router.post("/submit", submitOnboarding);

export default router;
