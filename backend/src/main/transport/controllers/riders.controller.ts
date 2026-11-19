import type { Request, Response } from "express";
import { ApiError } from "../../../utils/ApiError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendCreated, sendOk } from "../../../utils/response";
import type { AddRiderInput } from "../schemas/transport.schemas";
import { RiderService } from "../services/rider.service";

const school = (req: Request): string => {
  if (!req.user?.tenantId) throw ApiError.forbidden("You do not belong to a school", "FORBIDDEN");
  return req.user.tenantId;
};
const idOf = (req: Request) => (req.validatedParams as { id: string }).id;

export const listRiders = asyncHandler(async (req: Request, res: Response) => sendOk(res, await RiderService.list(school(req), idOf(req))));
export const addRider = asyncHandler(async (req: Request, res: Response) => sendCreated(res, await RiderService.add(school(req), idOf(req), req.validatedBody as AddRiderInput), "Student added to the route"));
export const removeRider = asyncHandler(async (req: Request, res: Response) => {
  const { id, studentId } = req.validatedParams as { id: string; studentId: string };
  return sendOk(res, await RiderService.remove(school(req), id, studentId), "Student taken off the route");
});
export const searchStudents = asyncHandler(async (req: Request, res: Response) => sendOk(res, await RiderService.searchStudents(school(req), (req.validatedQuery as { q: string }).q)));
