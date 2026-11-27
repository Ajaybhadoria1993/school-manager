import { Router } from "express";
import { requireAuth, requireAuthLoose, requireRole } from "../../../../middleware/auth";
import { photoFile } from "../../../../middleware/uploadPhoto";
import { resumeFile } from "../../../../middleware/uploadResume";
import { validate } from "../../../../middleware/validate";
import { downloadResume, getMyPhoto, getMyProfile, getResume, myTeacherRecords, removeMyPhoto, removeResume, saveMyPhoto, saveOwnResume, updateMyProfile } from "../../controllers/profile.controller";
import { ownProfileSchema } from "../../schemas/profile.schemas";

/**
 * `/api/v1/profile` (docs/profiles.md): the signed-in person's own details and photo, for everyone who works at the school (not parents).
 */
const router = Router();

const staffOfSchool = requireRole("school_admin", "principal", "accountant", "teacher", "receptionist", "management", "staff");

// The photo can be added during onboarding too, so these do not wait for the school's approval.
router.get("/photo", requireAuthLoose, staffOfSchool, getMyPhoto);
router.put("/photo", requireAuthLoose, staffOfSchool, photoFile, saveMyPhoto);
router.delete("/photo", requireAuthLoose, staffOfSchool, removeMyPhoto);

// The details of an approved school: while it is being set up, its onboarding form is where they are written.
router.get("/", requireAuth, staffOfSchool, getMyProfile);
router.put("/", requireAuth, staffOfSchool, validate(ownProfileSchema), updateMyProfile);

// A teacher's own resume (a staff member who also teaches too).
router.get("/resume", requireAuth, staffOfSchool, myTeacherRecords, getResume);
router.get("/resume/file", requireAuth, staffOfSchool, myTeacherRecords, downloadResume);
router.put("/resume", requireAuth, staffOfSchool, myTeacherRecords, resumeFile, saveOwnResume);
router.delete("/resume", requireAuth, staffOfSchool, myTeacherRecords, removeResume);

export default router;
