import { Router } from "express";
import { requireAuth, requireRole } from "../../../../middleware/auth";
import { validate } from "../../../../middleware/validate";
import {
  changeTeacherUsername,
  checkUsernameFree,
  createTeacher,
  createTeacherLogin,
  getMyTeacher,
  getTeacher,
  getTeacherClasses,
  getTeacherSummary,
  listTeachers,
  resetTeacherPassword,
  setClassTeacher,
  teacherExists,
  updateTeacher,
} from "../../controllers/staff.controller";
import { STAFF_READERS, STAFF_WRITERS } from "../../constants";
import {
  changeUsernameSchema,
  createTeacherSchema,
  idParamSchema,
  listTeachersQuerySchema,
  loginAccountSchema,
  resetPasswordSchema,
  setClassTeacherSchema,
  updateTeacherSchema,
  usernameCheckQuerySchema,
} from "../../schemas/staff.schemas";

const router = Router();

// Strict auth: the school must be approved.
router.use(requireAuth);

router.get("/teachers", requireRole(...STAFF_READERS), validate(listTeachersQuerySchema, "query"), listTeachers);

// A teacher's own record (before ":id" so "me" is not read as an id).
router.get("/teachers/me", requireRole("teacher"), getMyTeacher);

// Everything below is for the people who run the school: one teacher's whole page, and every change.
router.use(requireRole(...STAFF_WRITERS));
// Is this username free (on the whole platform)? Asked by Add teacher while the username is typed.
router.get("/usernames/check", validate(usernameCheckQuerySchema, "query"), checkUsernameFree);
// The numbers on top of the Teacher page (before ":id" so "summary" is not read as an id).
router.get("/teachers/summary", getTeacherSummary);
router.get("/teachers/:id",validate(idParamSchema, "params"), getTeacher);
router.post("/teachers", validate(createTeacherSchema), createTeacher);
router.patch("/teachers/:id", validate(idParamSchema, "params"), teacherExists, validate(updateTeacherSchema), updateTeacher);
router.post("/teachers/:id/login", validate(idParamSchema, "params"), teacherExists, validate(loginAccountSchema), createTeacherLogin);
router.post("/teachers/:id/reset-password", validate(idParamSchema, "params"), teacherExists, validate(resetPasswordSchema), resetTeacherPassword);
router.patch("/teachers/:id/login", validate(idParamSchema, "params"), teacherExists, validate(changeUsernameSchema), changeTeacherUsername);
// What a teacher has been given (their page): class teacher of, and the subjects of classes they teach.
router.get("/teachers/:id/classes", validate(idParamSchema, "params"), getTeacherClasses);
// The class teacher of a section (or of a class without sections), from the class's page or the teacher's.
router.put("/class-teachers", validate(setClassTeacherSchema), setClassTeacher);

export default router;
