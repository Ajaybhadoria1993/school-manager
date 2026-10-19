import { Request, Response } from "express";
import { ApiError } from "../../../utils/ApiError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendCreated, sendOk } from "../../../utils/response";
import type { InviteSchoolInput, ListTenantsQuery } from "../schemas/tenants.schemas";
import { InviteService } from "../services/invite.service";
import { ReviewService } from "../services/review.service";
import { listTenants as listTenantsQuery, overview, statusCounts } from "../services/tenantQueries";

export const inviteSchool = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized("Authentication required");
  const result = await InviteService.inviteSchool(req.validatedBody as InviteSchoolInput, req.user.userId);
  return sendCreated(res, result, result.emailSent ? "Invitation sent" : "School created, but the email could not be sent");
});

export const resendInvite = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.validatedParams as { id: string };
  const result = await InviteService.resendInvite(id);
  return sendOk(res, result, result.emailSent ? "Invitation sent again" : "The email could not be sent");
});

export const listTenants = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await listTenantsQuery((req.validatedQuery ?? {}) as ListTenantsQuery));
});

export const getCounts = asyncHandler(async (_req: Request, res: Response) => {
  return sendOk(res, await statusCounts());
});

export const getOverview = asyncHandler(async (_req: Request, res: Response) => {
  return sendOk(res, await overview());
});

export const getReview = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.validatedParams as { id: string };
  return sendOk(res, await ReviewService.detail(id));
});

function reviewer(req: Request): string {
  if (!req.user) throw ApiError.unauthorized("Authentication required");
  return req.user.userId;
}

export const approveSchool = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.validatedParams as { id: string };
  const { note } = req.validatedBody as { note?: string };
  return sendOk(res, { tenant: await ReviewService.approve(id, reviewer(req), note) }, "School approved");
});

export const rejectSchool = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.validatedParams as { id: string };
  const { reason } = req.validatedBody as { reason: string };
  return sendOk(res, { tenant: await ReviewService.reject(id, reviewer(req), reason) }, "School rejected");
});

export const suspendSchool = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.validatedParams as { id: string };
  const { reason } = req.validatedBody as { reason: string };
  return sendOk(res, { tenant: await ReviewService.suspend(id, reviewer(req), reason) }, "School suspended");
});

export const reactivateSchool = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.validatedParams as { id: string };
  const { note } = req.validatedBody as { note?: string };
  return sendOk(res, { tenant: await ReviewService.reactivate(id, reviewer(req), note) }, "School reactivated");
});
