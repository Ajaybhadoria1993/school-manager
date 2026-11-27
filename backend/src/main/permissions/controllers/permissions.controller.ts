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

/** Add staff's Role list: the roles the school named (made here, or typed under Other). */
export const listRoles = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await PermissionService.roleChoices(req.user!.tenantId!) });
});

export const createRole = asyncHandler(async (req: Request, res: Response) => {
  const body = req.validatedBody as { name: string };
  res.status(201).json({ success: true, data: await PermissionService.createRole(req.user!.tenantId!, body.name, req.user!.userId) });
});

export const deleteRole = asyncHandler(async (req: Request, res: Response) => {
  const { profile } = req.validatedParams as { profile: string };
  res.json({ success: true, data: await PermissionService.deleteRole(req.user!.tenantId!, profile) });
});

export const resetPermissions = asyncHandler(async (req: Request, res: Response) => {
  const { profile } = req.validatedParams as { profile: string };
  res.json({ success: true, data: await PermissionService.reset(req.user!.tenantId!, profile) });
});
