import { Router } from "express";
import { requireAuth, requireRole } from "../../../../middleware/auth";
import { yearView } from "../../../../middleware/yearView";
import { importFile } from "../../../../middleware/uploadSheet";
import { validate } from "../../../../middleware/validate";
import {
  changeStaffUsername,
  changeTeacherUsername,
  checkUsernameFree,
  createTeacher,
  createStaffMember,
  createTeacherLogin,
  exportTeachers,
  getMyTeacher,
  getTeacher,
  getTeacherClasses,
  getStaffMember,
  getTeacherSettings,
  getTeacherSummary,
  importTeachers,
  listStaffMembers,
  listTeachers,
  makeStaffLogin,
  readTeachersFile,
  removeStaffMember,
  resetStaffPassword,
  resetTeacherPassword,
  staffMemberExists,
  setClassTeacher,
  teacherExists,
  teachersTemplate,
  updateStaffMember,
  updateTeacher,
  updateTeacherSettings,
} from "../../controllers/staff.controller";
import { STAFF_READERS, STAFF_WRITERS } from "../../constants";
import {
  changeUsernameSchema,
  createStaffMemberSchema,
  createTeacherSchema,
  idParamSchema,
  importTeachersSchema,
  listStaffMembersQuerySchema,
  listTeachersQuerySchema,
  loginAccountSchema,
  resetPasswordSchema,
  setClassTeacherSchema,
  updateStaffMemberSchema,
  updateTeacherSchema,
  updateTeacherSettingsSchema,
  usernameCheckQuerySchema,
} from "../../schemas/staff.schemas";

const router = Router();

// Strict auth: the school must be approved.
// yearView: a school admin may look at a past year (X-Academic-Year); reads answer for it, changes are refused.
router.use(requireAuth, yearView);

router.get("/teachers", requireRole(...STAFF_READERS), validate(listTeachersQuerySchema, "query"), listTeachers);

// A teacher's own record (before ":id" so "me" is not read as an id).
router.get("/teachers/me", requireRole("teacher"), getMyTeacher);

// Everything below is for the people who run the school: one teacher's whole page, and every change.
router.use(requireRole(...STAFF_WRITERS));
// Is this username free (on the whole platform)? Asked by Add teacher while the username is typed.
router.get("/usernames/check", validate(usernameCheckQuerySchema, "query"), checkUsernameFree);
// The numbers on top of the Teacher page (before ":id" so "summary" is not read as an id).
router.get("/teachers/summary", getTeacherSummary);
// Staff: the people who work for the school without teaching. The school makes their username and password (there is no invitation for staff).
router.get("/members", validate(listStaffMembersQuerySchema, "query"), listStaffMembers);
router.post("/members", validate(createStaffMemberSchema), createStaffMember);
router.get("/members/:id", validate(idParamSchema, "params"), getStaffMember);
router.patch("/members/:id", validate(idParamSchema, "params"), staffMemberExists, validate(updateStaffMemberSchema), updateStaffMember);
router.post("/members/:id/login", validate(idParamSchema, "params"), staffMemberExists, validate(loginAccountSchema), makeStaffLogin);
router.post("/members/:id/reset-password", validate(idParamSchema, "params"), staffMemberExists, validate(resetPasswordSchema), resetStaffPassword);
router.patch("/members/:id/login", validate(idParamSchema, "params"), staffMemberExists, validate(changeUsernameSchema), changeStaffUsername);
router.delete("/members/:id", validate(idParamSchema, "params"), staffMemberExists, removeStaffMember);
// The school's own fields for its teachers (before ":id").
router.get("/teachers/settings", getTeacherSettings);
router.put("/teachers/settings", validate(updateTeacherSettingsSchema), updateTeacherSettings);
// The teachers as an Excel file, with the list's own filters (the sample file's columns first, so it can be uploaded back).
router.get("/teachers/export", validate(listTeachersQuerySchema, "query"), exportTeachers);
// Bringing many teachers in at once: the sample file, reading an uploaded file, then making its rows in parts (fixed paths before ":id").
router.get("/teachers/import/template", teachersTemplate);
router.post("/teachers/import/read", importFile, readTeachersFile);
router.post("/teachers/import", validate(importTeachersSchema), importTeachers);
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
