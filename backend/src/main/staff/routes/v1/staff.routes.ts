import { Router } from "express";
import { requireAuth, requireRole } from "../../../../middleware/auth";
import { requirePermission, requireRoleOrPermission } from "../../../../middleware/permission";
import { yearView } from "../../../../middleware/yearView";
import { importFile } from "../../../../middleware/uploadSheet";
import { validate } from "../../../../middleware/validate";
import {
  changeStaffUsername,
  addTeacherToMedium,
  changeTeacherUsername,
  checkUsernameFree,
  createTeacher,
  createStaffMember,
  createTeacherLogin,
  exportTeachers,
  exportTeachersPreview,
  getMyTeacher,
  getTeacher,
  getTeacherClasses,
  getStaffMember,
  getTeacherSettings,
  getTeacherSummary,
  importTeachers,
  listStaffMembers,
  listTeacherMediums,
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
  addTeacherMediumSchema,
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

router.get("/teachers", requireRoleOrPermission(STAFF_READERS, "teachers.view", "timetable.edit", "classes.view", "classes.manage"), validate(listTeachersQuerySchema, "query"), listTeachers);

// A teacher's own record (before ":id" so "me" is not read as an id).
router.get("/teachers/me", requireRole("teacher"), getMyTeacher);

// Everything below follows the school's Permissions (docs/permissions.md): the school admin and the principal always; anyone else by the key
// of each route (teachers.view / add / edit / export / settings, staff.view / add / edit).
const seeTeachers = requirePermission("teachers.view");
const addTeachers = requirePermission("teachers.add");
const editTeachers = requirePermission("teachers.edit");
const seeStaff = requirePermission("staff.view");
const addStaff = requirePermission("staff.add");
const editStaff = requirePermission("staff.edit");
// Is this username free (on the whole platform)? Asked by every form that makes a login while the username is typed.
router.get("/usernames/check", requirePermission("teachers.add", "teachers.edit", "staff.add", "staff.edit", "students.add", "students.edit"), validate(usernameCheckQuerySchema, "query"), checkUsernameFree);
// The numbers on top of the Teacher page (before ":id" so "summary" is not read as an id).
router.get("/teachers/summary", seeTeachers, getTeacherSummary);
// Staff: the people who work for the school without teaching. The school makes their username and password (there is no invitation for staff).
router.get("/members", seeStaff, validate(listStaffMembersQuerySchema, "query"), listStaffMembers);
router.post("/members", addStaff, validate(createStaffMemberSchema), createStaffMember);
router.get("/members/:id", seeStaff, validate(idParamSchema, "params"), getStaffMember);
router.patch("/members/:id", editStaff, validate(idParamSchema, "params"), staffMemberExists, validate(updateStaffMemberSchema), updateStaffMember);
router.post("/members/:id/login", editStaff, validate(idParamSchema, "params"), staffMemberExists, validate(loginAccountSchema), makeStaffLogin);
router.post("/members/:id/reset-password", editStaff, validate(idParamSchema, "params"), staffMemberExists, validate(resetPasswordSchema), resetStaffPassword);
router.patch("/members/:id/login", editStaff, validate(idParamSchema, "params"), staffMemberExists, validate(changeUsernameSchema), changeStaffUsername);
router.delete("/members/:id", editStaff, validate(idParamSchema, "params"), staffMemberExists, removeStaffMember);
// The school's own fields for its teachers (before ":id").
router.get("/teachers/settings", requirePermission("teachers.view"), getTeacherSettings);
router.put("/teachers/settings", requirePermission("teachers.settings"), validate(updateTeacherSettingsSchema), updateTeacherSettings);
// The teachers as an Excel file, with the list's own filters (the sample file's columns first, so it can be uploaded back).
router.get("/teachers/export", requirePermission("teachers.export"), validate(listTeachersQuerySchema, "query"), exportTeachers);
// What the Export page shows before the file is made: the first teachers (or a sample row) in every column.
router.get("/teachers/export/preview", requirePermission("teachers.export"), validate(listTeachersQuerySchema, "query"), exportTeachersPreview);
// Bringing many teachers in at once: the sample file, reading an uploaded file, then making its rows in parts (fixed paths before ":id").
router.get("/teachers/import/template", addTeachers, teachersTemplate);
router.post("/teachers/import/read", addTeachers, importFile, readTeachersFile);
router.post("/teachers/import", addTeachers, validate(importTeachersSchema), importTeachers);
router.get("/teachers/:id", seeTeachers, validate(idParamSchema, "params"), getTeacher);
router.post("/teachers", addTeachers, validate(createTeacherSchema), createTeacher);
router.patch("/teachers/:id", editTeachers, validate(idParamSchema, "params"), teacherExists, validate(updateTeacherSchema), updateTeacher);
router.post("/teachers/:id/login", editTeachers, validate(idParamSchema, "params"), teacherExists, validate(loginAccountSchema), createTeacherLogin);
router.post("/teachers/:id/reset-password", editTeachers, validate(idParamSchema, "params"), teacherExists, validate(resetPasswordSchema), resetTeacherPassword);
router.patch("/teachers/:id/login", editTeachers, validate(idParamSchema, "params"), teacherExists, validate(changeUsernameSchema), changeTeacherUsername);
// What a teacher has been given (their page): class teacher of, and the subjects of classes they teach.
router.get("/teachers/:id/classes", seeTeachers, validate(idParamSchema, "params"), getTeacherClasses);
// A teacher who teaches in more than one medium of the school keeps one login: only the school's administrator, who can see every medium, adds them.
router.get("/teachers/:id/mediums", requireRole("school_admin"), validate(idParamSchema, "params"), listTeacherMediums);
router.post("/teachers/:id/mediums", requireRole("school_admin"), validate(idParamSchema, "params"), teacherExists, validate(addTeacherMediumSchema), addTeacherToMedium);
// The class teacher of a section (or of a class without sections), from the class's page or the teacher's.
router.put("/class-teachers", requirePermission("teachers.edit", "classes.manage"), validate(setClassTeacherSchema), setClassTeacher);

export default router;
