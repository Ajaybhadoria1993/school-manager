import { Router } from "express";
import { requireAuth, requireRole } from "../../../../middleware/auth";
import { requirePermission, requireRoleOrPermission, requireSchoolPermission } from "../../../../middleware/permission";
import { photoFile } from "../../../../middleware/uploadPhoto";
import { downloadResume, getPersonPhoto, getResume, removePersonPhoto, removeResume, savePersonPhoto, saveResume, staffPhotoOwner, teacherPhotoOwner } from "../../../profile/controllers/profile.controller";
import { resumeFile } from "../../../../middleware/uploadResume";
import { yearView } from "../../../../middleware/yearView";
import { importFile } from "../../../../middleware/uploadSheet";
import { validate } from "../../../../middleware/validate";
import {
  addTeacherToMedium,
  checkUsernameFree,
  createTeacher,
  createStaffMember,
  exportTeachers,
  exportTeachersPreview,
  getMyTeacher,
  getTeacher,
  getTeacherClasses,
  getStaffMember,
  getTeacherSettings,
  getTeacherSummary,
  giveStaffLogin,
  giveTeacherLogin,
  importTeachers,
  listStaffMembers,
  listTeacherMediums,
  listTeachers,
  readTeachersFile,
  removeStaffMember,
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
  createStaffMemberSchema,
  createTeacherSchema,
  giveLoginSchema,
  idParamSchema,
  importTeachersSchema,
  listStaffMembersQuerySchema,
  listTeachersQuerySchema,
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
// Staff: the people who work for the school without teaching. A login is their email, given with an invitation (2026-11-26).
router.get("/members", seeStaff, validate(listStaffMembersQuerySchema, "query"), listStaffMembers);
router.post("/members", addStaff, validate(createStaffMemberSchema), createStaffMember);
router.get("/members/:id", seeStaff, validate(idParamSchema, "params"), getStaffMember);
router.patch("/members/:id", editStaff, validate(idParamSchema, "params"), staffMemberExists, validate(updateStaffMemberSchema), updateStaffMember);
// Give login access (2026-11-26): their email becomes the login, Pending until they choose a password from the invitation; again = the invitation again.
router.post("/members/:id/login", editStaff, validate(idParamSchema, "params"), staffMemberExists, validate(giveLoginSchema), giveStaffLogin);
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
// Give login access (2026-11-26), as for staff.
router.post("/teachers/:id/login", editTeachers, validate(idParamSchema, "params"), teacherExists, validate(giveLoginSchema), giveTeacherLogin);
// What a teacher has been given (their page): class teacher of, and the subjects of classes they teach.
router.get("/teachers/:id/classes", seeTeachers, validate(idParamSchema, "params"), getTeacherClasses);
// A teacher who teaches in more than one medium of the school keeps one login: only the school's administrator, who can see every medium, adds them.
router.get("/teachers/:id/mediums", requireRole("school_admin"), validate(idParamSchema, "params"), listTeacherMediums);
router.post("/teachers/:id/mediums", requireRole("school_admin"), validate(idParamSchema, "params"), teacherExists, validate(addTeacherMediumSchema), addTeacherToMedium);
// A teacher's and a staff member's profile photo (docs/profiles.md). "Is there such a person" is asked before the file is read (404 before 400).
router.get("/teachers/:id/photo", requireSchoolPermission("teachers.view", "teachers.add", "teachers.edit"), validate(idParamSchema, "params"), teacherPhotoOwner, getPersonPhoto);
router.put("/teachers/:id/photo", requireSchoolPermission("teachers.add", "teachers.edit"), validate(idParamSchema, "params"), teacherPhotoOwner, photoFile, savePersonPhoto("teachers.edit"));
router.delete("/teachers/:id/photo", requireSchoolPermission("teachers.edit"), validate(idParamSchema, "params"), teacherPhotoOwner, removePersonPhoto);
router.get("/members/:id/photo", requireSchoolPermission("staff.view", "staff.add", "staff.edit"), validate(idParamSchema, "params"), staffPhotoOwner, getPersonPhoto);
router.put("/members/:id/photo", requireSchoolPermission("staff.add", "staff.edit"), validate(idParamSchema, "params"), staffPhotoOwner, photoFile, savePersonPhoto("staff.edit"));
router.delete("/members/:id/photo", requireSchoolPermission("staff.edit"), validate(idParamSchema, "params"), staffPhotoOwner, removePersonPhoto);
// A teacher's resume (docs/profiles.md): like the photo; downloaded only by someone who may see the teacher.
const seeResume = requireSchoolPermission("teachers.view", "teachers.add", "teachers.edit");
router.get("/teachers/:id/resume", seeResume, validate(idParamSchema, "params"), teacherPhotoOwner, getResume);
router.get("/teachers/:id/resume/file", seeResume, validate(idParamSchema, "params"), teacherPhotoOwner, downloadResume);
router.put("/teachers/:id/resume", requireSchoolPermission("teachers.add", "teachers.edit"), validate(idParamSchema, "params"), teacherPhotoOwner, resumeFile, saveResume);
router.delete("/teachers/:id/resume", requireSchoolPermission("teachers.edit"), validate(idParamSchema, "params"), teacherPhotoOwner, removeResume);
// The class teacher of a section (or of a class without sections), from the class's page or the teacher's.
router.put("/class-teachers", requirePermission("teachers.edit", "classes.manage"), validate(setClassTeacherSchema), setClassTeacher);

export default router;
