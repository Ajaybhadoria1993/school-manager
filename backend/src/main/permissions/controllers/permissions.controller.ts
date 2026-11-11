import type { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import { PermissionService } from "../services/permission.service";

export const getPermissions = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await PermissionService.overview(req.user!.tenantId!) });
});

export const savePermissions = asyncHandler(async (req: Request, res: Response) => {
  const body = req.validatedBody as { permissions: string[] };
  const { profile } = req.validatedParams as { profile: string };
  res.json({ success: true, data: await PermissionService.save(req.user!.tenantId!, profile, body.permissions, req.user!.userId) });
});

export const resetPermissions = asyncHandler(async (req: Request, res: Response) => {
  const { profile } = req.validatedParams as { profile: string };
  res.json({ success: true, data: await PermissionService.reset(req.user!.tenantId!, profile) });
});
