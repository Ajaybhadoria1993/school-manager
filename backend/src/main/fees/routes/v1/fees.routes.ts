import { Router } from "express";
import { requireAuth } from "../../../../middleware/auth";
import { requireSchoolPermission } from "../../../../middleware/permission";
import { validate } from "../../../../middleware/validate";
import { yearView } from "../../../../middleware/yearView";
import {
  copyClass,
  copyYear,
  createConcession,
  createHead,
  createHeads,
  createLines,
  deleteConcession,
  deleteHead,
  deleteLine,
  getRules,
  getStructure,
  listConcessions,
  listHeads,
  saveRules,
  updateConcession,
  updateHead,
  updateLine,
} from "../../controllers/fees.controller";
import {
  copyClassSchema,
  copyYearSchema,
  createConcessionSchema,
  createHeadSchema,
  createHeadsSchema,
  createLinesSchema,
  feeRulesSchema,
  idParamSchema,
  listConcessionsQuerySchema,
  listHeadsQuerySchema,
  structureQuerySchema,
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

export default router;
