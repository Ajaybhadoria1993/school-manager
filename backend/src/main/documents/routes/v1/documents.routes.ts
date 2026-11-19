import { Router } from "express";
import { requireAuth } from "../../../../middleware/auth";
import { requireSchoolPermission } from "../../../../middleware/permission";
import { photoFile } from "../../../../middleware/uploadPhoto";
import { validate } from "../../../../middleware/validate";
import { cancelCertificate, getAdmitCard, getCertificate, getClassAdmitCards, getClassIdCards, getClassReportCards, getIdCard, getOptions, getPhoto, getReportCard, getSettings, issueCertificate, listCertificates, removePhoto, resetSettings, searchStudents, saveRemark, savePhoto, saveSettings } from "../../controllers/documents.controller";
import { cancelCertificateSchema, certificatesQuerySchema, classCardsQuerySchema, classReportQuerySchema, idParamSchema, issueCertificateSchema, remarkSchema, reportQuerySchema, settingsSchema, studentSearchQuerySchema } from "../../schemas/documents.schemas";

/**
 * `/api/v1/documents`: what the school prints for a student: the ID card and the exam report card (one student, or a whole class or section), and the
 * student's photo for the card. Reading follows the school's Permissions (`documents.view`); changing a photo is `students.edit`. A teacher or a parent
 * never reaches these (a parent reads their own child's through `/parent/children/:id/...`).
 */
const router = Router();
router.use(requireAuth);

const see = requireSchoolPermission("documents.view");
const editPhoto = requireSchoolPermission("students.edit");
const manage = requireSchoolPermission("documents.manage");

router.get("/options", see, getOptions);
router.get("/students/search", see, validate(studentSearchQuerySchema, "query"), searchStudents);
router.get("/students/:id/id-card", see, validate(idParamSchema, "params"), getIdCard);
router.get("/students/:id/report-card", see, validate(idParamSchema, "params"), validate(reportQuerySchema, "query"), getReportCard);
router.get("/classes/:id/id-cards", see, validate(idParamSchema, "params"), validate(classCardsQuerySchema, "query"), getClassIdCards);
router.get("/classes/:id/report-cards", see, validate(idParamSchema, "params"), validate(classReportQuerySchema, "query"), getClassReportCards);

// A child's face is not served at an address: it comes inside the answers of people who may see the student.
router.get("/students/:id/photo", requireSchoolPermission("documents.view", "students.view"), validate(idParamSchema, "params"), getPhoto);
router.put("/students/:id/photo", editPhoto, validate(idParamSchema, "params"), photoFile, savePhoto);
router.delete("/students/:id/photo", editPhoto, validate(idParamSchema, "params"), removePhoto);

// The admit card, the class teacher's remark on a report card, how the school grades, and the certificates it issues (2026-11-19).
router.get("/students/:id/admit-card", see, validate(idParamSchema, "params"), validate(reportQuerySchema, "query"), getAdmitCard);
router.get("/classes/:id/admit-cards", see, validate(idParamSchema, "params"), validate(classReportQuerySchema, "query"), getClassAdmitCards);
router.put("/remarks", manage, validate(remarkSchema), saveRemark);

router.get("/settings", see, getSettings);
router.put("/settings", manage, validate(settingsSchema), saveSettings);
router.delete("/settings", manage, resetSettings);

router.get("/certificates", see, validate(certificatesQuerySchema, "query"), listCertificates);
router.get("/certificates/:id", see, validate(idParamSchema, "params"), getCertificate);
router.post("/students/:id/certificates", manage, validate(idParamSchema, "params"), validate(issueCertificateSchema), issueCertificate);
router.post("/certificates/:id/cancel", manage, validate(idParamSchema, "params"), validate(cancelCertificateSchema), cancelCertificate);

export default router;
