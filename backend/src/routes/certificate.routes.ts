import { Router } from "express";
import {
  issueTransferCertificate,
  issueBonafideCertificate,
  issueFeePaidCertificate,
  reissueCertificate,
  listCertificates,
  getCertificate,
  getStudentIdCard,
  getStaffIdCard,
} from "../controllers/certificate.controller";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

const ISSUER_ROLES = ["super_admin", "school_admin", "principal"] as const;

router.post("/transfer", requireRole(...ISSUER_ROLES), issueTransferCertificate);
router.post("/bonafide", requireRole(...ISSUER_ROLES), issueBonafideCertificate);
router.post("/fee-paid", requireRole(...ISSUER_ROLES, "accountant"), issueFeePaidCertificate);
router.post("/:id/reissue", requireRole(...ISSUER_ROLES), reissueCertificate);

router.get("/", listCertificates);
router.get("/:id", getCertificate);

router.get("/id-card/student/:studentId", getStudentIdCard);
router.get("/id-card/staff/:staffId", requireRole(...ISSUER_ROLES), getStaffIdCard);

export default router;
