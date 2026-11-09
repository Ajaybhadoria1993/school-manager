import { Request, Response } from "express";
import { ApiError } from "../../../utils/ApiError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendOk } from "../../../utils/response";
import type { BellQueryInput } from "../schemas/notifications.schemas";
import { NotificationService } from "../services/notification.service";

function me(req: Request): { tenantId: string | null; userId: string } {
  if (!req.user) throw ApiError.unauthorized("Authentication required", "TOKEN_MISSING");
  return { tenantId: req.user.tenantId, userId: req.user.userId };
}

const idOf = (req: Request) => (req.validatedParams as { id: string }).id;

export const listNotifications = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = me(req);
  // The platform's own admins belong to no school: nothing is sent to them (yet).
  if (!tenantId) return sendOk(res, { items: [], unread: 0, hasMore: false });
  return sendOk(res, await NotificationService.list(tenantId, userId, req.validatedQuery as BellQueryInput));
});

export const readNotification = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = me(req);
  if (!tenantId) throw ApiError.notFound("Notification not found", "NOTIFICATION_NOT_FOUND");
  return sendOk(res, await NotificationService.read(tenantId, userId, idOf(req)));
});

export const readAllNotifications = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = me(req);
  if (!tenantId) return sendOk(res, { unread: 0 });
  return sendOk(res, await NotificationService.readAll(tenantId, userId));
});
