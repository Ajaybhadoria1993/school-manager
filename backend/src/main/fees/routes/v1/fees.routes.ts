import { Router } from "express";
import { requireAuth, requireRole } from "../../../../middleware/auth";
import { requireSchoolPermission } from "../../../../middleware/permission";
import { validate } from "../../../../middleware/validate";
import { yearView } from "../../../../middleware/yearView";
import {
  addOptional,
  approveConcession,
  cancelReceipt,
  collect,
  copyClass,
  copyYear,
  createConcession,
  createHead,
  createHeads,
  createLines,
  deleteConcession,
  deleteHead,
  deleteLine,
  generateAccount,
  generateAll,
  getAccount,
  getDues,
  getReceipt,
  getRules,
  getStructure,
  getSummary,
  giveConcession,
  listConcessions,
  listReceipts,
  listHeads,
  removeOptional,
  revokeConcession,
  saveRules,
  searchStudents,
  updateConcession,
  updateHead,
  updateLine,
} from "../../controllers/fees.controller";
import {
  accountQuerySchema,
  addOptionalSchema,
  cancelReceiptSchema,
  collectSchema,
  copyClassSchema,
  copyYearSchema,
  createConcessionSchema,
  createHeadSchema,
  createHeadsSchema,
  createLinesSchema,
  duesQuerySchema,
  feeRulesSchema,
  generateAllSchema,
  giveConcessionSchema,
  idParamSchema,
  listConcessionsQuerySchema,
  listHeadsQuerySchema,
  optionalParamsSchema,
  receiptsQuerySchema,
  structureQuerySchema,
  studentSearchQuerySchema,
  summaryQuerySchema,
  updateConcessionSchema,
  updateHeadSchema,
  updateLineSchema,
} from "../../schemas/fees.schemas";

/**
 * `/api/v1/fees`: the school's fee heads, each class's fee chart for a session, the concessions it gives and its fee rules. Who may look and
 * who may change follows the school's Permissions (fees.view / fees.manage); a teacher or a parent never reaches these pages.
 * yearView: a school admin may look at a past year (X-Academic-Year); reads answer for it, changes are refused.
 */
const router = Router();

router.use(requireAuth, yearView);

const see = requireSchoolPermission("fees.view");
const change = requireSchoolPermission("fees.manage");
const take = requireSchoolPermission("fees.collect");

router.get("/heads", see, validate(listHeadsQuerySchema, "query"), listHeads);
router.post("/heads", change, validate(createHeadSchema), createHead);
router.post("/heads/many", change, validate(createHeadsSchema), createHeads);
router.patch("/heads/:id", change, validate(idParamSchema, "params"), validate(updateHeadSchema), updateHead);
router.delete("/heads/:id", change, validate(idParamSchema, "params"), deleteHead);

router.get("/structure", see, validate(structureQuerySchema, "query"), getStructure);
router.post("/structure/lines", change, validate(createLinesSchema), createLines);
router.patch("/structure/lines/:id", change, validate(idParamSchema, "params"), validate(updateLineSchema), updateLine);
router.delete("/structure/lines/:id", change, validate(idParamSchema, "params"), deleteLine);
router.post("/structure/copy-class", change, validate(copyClassSchema), copyClass);
router.post("/structure/copy-year", change, validate(copyYearSchema), copyYear);

router.get("/concessions", see, validate(listConcessionsQuerySchema, "query"), listConcessions);
router.post("/concessions", change, validate(createConcessionSchema), createConcession);
router.patch("/concessions/:id", change, validate(idParamSchema, "params"), validate(updateConcessionSchema), updateConcession);
router.delete("/concessions/:id", change, validate(idParamSchema, "params"), deleteConcession);

router.get("/rules", see, getRules);
router.put("/rules", change, validate(feeRulesSchema), saveRules);

// ---- collecting (2026-11-19): a student's fee account, taking payments, receipts, the dues and the day's collection ----------------------------
// `fees.collect` takes fees and reads the accounts; giving a concession and cancelling a receipt are `fees.manage`; approving a concession that
// needed approval is for the school admin and the principal.
router.get("/students/search", take, validate(studentSearchQuerySchema, "query"), searchStudents);
router.get("/students/:id/account", take, validate(idParamSchema, "params"), validate(accountQuerySchema, "query"), getAccount);
router.post("/students/:id/generate", take, validate(idParamSchema, "params"), generateAccount);
router.post("/students/:id/optional", take, validate(idParamSchema, "params"), validate(addOptionalSchema), addOptional);
router.delete("/students/:id/optional/:lineId", take, validate(optionalParamsSchema, "params"), removeOptional);
router.post("/students/:id/concessions", change, validate(idParamSchema, "params"), validate(giveConcessionSchema), giveConcession);
router.post("/student-concessions/:id/approve", requireRole("school_admin", "principal"), validate(idParamSchema, "params"), approveConcession);
router.delete("/student-concessions/:id", change, validate(idParamSchema, "params"), revokeConcession);
router.post("/generate", change, validate(generateAllSchema), generateAll);

router.post("/collect", take, validate(collectSchema), collect);
router.get("/receipts", take, validate(receiptsQuerySchema, "query"), listReceipts);
router.get("/receipts/:id", take, validate(idParamSchema, "params"), getReceipt);
router.post("/receipts/:id/cancel", change, validate(idParamSchema, "params"), validate(cancelReceiptSchema), cancelReceipt);
router.get("/dues", take, validate(duesQuerySchema, "query"), getDues);
router.get("/collection", take, validate(summaryQuerySchema, "query"), getSummary);

export default router;
