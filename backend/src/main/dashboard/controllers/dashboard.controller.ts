import type { Request, Response } from "express";
import { ApiError } from "../../../utils/ApiError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendOk } from "../../../utils/response";
import type { DashboardQuery, TrendQuery } from "../schemas/dashboard.schemas";
import { SchoolDashboardService } from "../services/schoolDashboard.service";

export const schoolDashboard = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.tenantId) throw ApiError.forbidden("You do not belong to a school", "FORBIDDEN");
  const { from, to } = (req.validatedQuery ?? {}) as DashboardQuery;
  return sendOk(res, await SchoolDashboardService.summary(req.user.tenantId, from && to ? { from, to } : undefined));
});

export const schoolTrend = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.tenantId) throw ApiError.forbidden("You do not belong to a school", "FORBIDDEN");
  return sendOk(res, await SchoolDashboardService.trend(req.user.tenantId, (req.validatedQuery as TrendQuery).period));
});
