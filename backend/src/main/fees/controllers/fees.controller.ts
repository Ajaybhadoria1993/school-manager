import type { Request, Response } from "express";
import { ApiError } from "../../../utils/ApiError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendCreated, sendOk } from "../../../utils/response";
import { FeeAccountService } from "../services/feeAccount.service";
import { FeeCollectionService } from "../services/feeCollection.service";
import { FeeHeadService } from "../services/feeHead.service";
import { FeeRulesService } from "../services/feeRules.service";
import { FeeStructureService } from "../services/feeStructure.service";
import { StudentConcessionService } from "../services/studentConcession.service";

/** The caller's own school, from the signed-in user, never from the request. */
const school = (req: Request): string => {
  if (!req.user?.tenantId) throw ApiError.forbidden("You do not belong to a school", "FORBIDDEN");
  return req.user.tenantId;
};
const idOf = (req: Request) => (req.validatedParams as { id: string }).id;
const body = (req: Request) => req.validatedBody as never;
const query = (req: Request) => req.validatedQuery as never;

export const listHeads = asyncHandler(async (req: Request, res: Response) => sendOk(res, await FeeHeadService.list(school(req), (query(req) as { status: "active" | "inactive" | "all" }).status)));
export const createHead = asyncHandler(async (req: Request, res: Response) => sendCreated(res, await FeeHeadService.create(school(req), body(req)), "Fee added"));
export const createHeads = asyncHandler(async (req: Request, res: Response) => sendCreated(res, await FeeHeadService.createMany(school(req), (body(req) as { heads: never[] }).heads), "Fees added"));
export const updateHead = asyncHandler(async (req: Request, res: Response) => sendOk(res, await FeeHeadService.update(school(req), idOf(req), body(req)), "Fee saved"));
export const deleteHead = asyncHandler(async (req: Request, res: Response) => {
  await FeeHeadService.remove(school(req), idOf(req));
  return sendOk(res, null, "Fee removed");
});

export const getStructure = asyncHandler(async (req: Request, res: Response) => sendOk(res, await FeeStructureService.get(school(req), (query(req) as { yearId?: string }).yearId)));
export const createLines = asyncHandler(async (req: Request, res: Response) => sendCreated(res, await FeeStructureService.createLines(school(req), body(req)), "Fee added"));
export const updateLine = asyncHandler(async (req: Request, res: Response) => sendOk(res, await FeeStructureService.updateLine(school(req), idOf(req), body(req)), "Fee saved"));
export const deleteLine = asyncHandler(async (req: Request, res: Response) => {
  await FeeStructureService.removeLine(school(req), idOf(req));
  return sendOk(res, null, "Fee removed");
});
export const copyClass = asyncHandler(async (req: Request, res: Response) => sendOk(res, await FeeStructureService.copyClass(school(req), body(req)), "Fees copied"));
export const copyYear = asyncHandler(async (req: Request, res: Response) => sendOk(res, await FeeStructureService.copyYear(school(req), body(req)), "Fees copied"));

export const listConcessions = asyncHandler(async (req: Request, res: Response) => sendOk(res, await FeeRulesService.listConcessions(school(req), (query(req) as { status: "active" | "inactive" | "all" }).status)));
export const createConcession = asyncHandler(async (req: Request, res: Response) => sendCreated(res, await FeeRulesService.createConcession(school(req), body(req)), "Concession added"));
export const updateConcession = asyncHandler(async (req: Request, res: Response) => sendOk(res, await FeeRulesService.updateConcession(school(req), idOf(req), body(req)), "Concession saved"));
export const deleteConcession = asyncHandler(async (req: Request, res: Response) => {
  await FeeRulesService.removeConcession(school(req), idOf(req));
  return sendOk(res, null, "Concession removed");
});

export const getRules = asyncHandler(async (req: Request, res: Response) => sendOk(res, await FeeRulesService.getRules(school(req))));
export const saveRules = asyncHandler(async (req: Request, res: Response) => sendOk(res, await FeeRulesService.saveRules(school(req), req.user?.userId ?? null, body(req)), "Fee rules saved"));

// ---- collecting (2026-11-19) -----------------------------------------------------------------------------------------------------------
const userOf = (req: Request) => {
  if (!req.user) throw ApiError.forbidden("You do not belong to a school", "FORBIDDEN");
  return { userId: req.user.userId, role: req.user.role };
};

export const searchStudents = asyncHandler(async (req: Request, res: Response) => sendOk(res, await FeeAccountService.search(school(req), (query(req) as { q: string }).q)));
export const getAccount = asyncHandler(async (req: Request, res: Response) => sendOk(res, await FeeAccountService.account(school(req), idOf(req), (query(req) as { yearId?: string }).yearId)));
export const generateAccount = asyncHandler(async (req: Request, res: Response) => {
  await FeeAccountService.generate(school(req), idOf(req));
  return sendOk(res, await FeeAccountService.account(school(req), idOf(req)), "Fees made");
});
export const generateAll = asyncHandler(async (req: Request, res: Response) => sendOk(res, await FeeAccountService.generateAll(school(req), (body(req) as { classId?: string }).classId), "Fees made"));
export const addOptional = asyncHandler(async (req: Request, res: Response) => sendCreated(res, await FeeAccountService.addOptional(school(req), idOf(req), (body(req) as { lineId: string }).lineId), "Fee added"));
export const removeOptional = asyncHandler(async (req: Request, res: Response) => {
  const { id, lineId } = req.validatedParams as { id: string; lineId: string };
  return sendOk(res, await FeeAccountService.removeOptional(school(req), id, lineId), "Fee taken off");
});

export const giveConcession = asyncHandler(async (req: Request, res: Response) => sendCreated(res, await StudentConcessionService.give(school(req), userOf(req), idOf(req), body(req)), "Concession given"));
export const approveConcession = asyncHandler(async (req: Request, res: Response) => sendOk(res, await StudentConcessionService.approve(school(req), userOf(req).userId, idOf(req)), "Concession approved"));
export const revokeConcession = asyncHandler(async (req: Request, res: Response) => sendOk(res, await StudentConcessionService.revoke(school(req), idOf(req)), "Concession taken back"));

export const collect = asyncHandler(async (req: Request, res: Response) => sendCreated(res, await FeeCollectionService.collect(school(req), userOf(req).userId, body(req)), "Payment received"));
export const listReceipts = asyncHandler(async (req: Request, res: Response) => sendOk(res, await FeeCollectionService.receipts(school(req), query(req))));
export const getReceipt = asyncHandler(async (req: Request, res: Response) => sendOk(res, await FeeCollectionService.receipt(school(req), idOf(req))));
export const cancelReceipt = asyncHandler(async (req: Request, res: Response) => sendOk(res, await FeeCollectionService.cancel(school(req), userOf(req).userId, idOf(req), (body(req) as { reason: string }).reason), "Receipt cancelled"));
export const getDues = asyncHandler(async (req: Request, res: Response) => sendOk(res, await FeeCollectionService.dues(school(req), query(req))));
export const getSummary = asyncHandler(async (req: Request, res: Response) => sendOk(res, await FeeCollectionService.summary(school(req), query(req))));
