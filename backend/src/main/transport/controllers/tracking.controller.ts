import type { Request, Response } from "express";
import { ApiError } from "../../../utils/ApiError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendCreated, sendOk } from "../../../utils/response";
import type { PingInput } from "../schemas/transport.schemas";
import { TrackingService } from "../services/tracking.service";

const school = (req: Request): string => {
  if (!req.user?.tenantId) throw ApiError.forbidden("You do not belong to a school", "FORBIDDEN");
  return req.user.tenantId;
};
const idOf = (req: Request) => (req.validatedParams as { id: string }).id;

/**
 * The driver's link, sent in the `X-Tracking-Link` header (never in the address, where it would be logged and remembered). Not `Authorization`:
 * a person signed in on the same browser has their own token there.
 */
const linkOf = (req: Request): string | null => {
  const link = req.header("x-tracking-link");
  return link ? link.trim() : null;
};

// ---- the office -------------------------------------------------------------------------------------------------------------------------
export const getLive = asyncHandler(async (req: Request, res: Response) => sendOk(res, await TrackingService.live(school(req))));
export const issueKey = asyncHandler(async (req: Request, res: Response) => sendCreated(res, await TrackingService.issueKey(school(req), idOf(req)), "Driver link made"));
export const revokeKey = asyncHandler(async (req: Request, res: Response) => {
  await TrackingService.revokeKey(school(req), idOf(req));
  return sendOk(res, null, "Driver link switched off");
});

// ---- the driver's phone (no sign-in: the link is the proof) -------------------------------------------------------------------------------
export const driverSession = asyncHandler(async (req: Request, res: Response) => sendOk(res, await TrackingService.session(linkOf(req))));
export const driverPing = asyncHandler(async (req: Request, res: Response) => {
  await TrackingService.ping(linkOf(req), req.validatedBody as PingInput);
  return sendOk(res, null);
});
export const driverStop = asyncHandler(async (req: Request, res: Response) => {
  await TrackingService.stop(linkOf(req));
  return sendOk(res, null, "Trip ended");
});
