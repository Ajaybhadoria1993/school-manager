import type { Request, Response } from "express";
import { ApiError } from "../../../utils/ApiError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendCreated, sendOk } from "../../../utils/response";
import { FeeHeadService } from "../services/feeHead.service";
import { FeeRulesService } from "../services/feeRules.service";
import { FeeStructureService } from "../services/feeStructure.service";

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
