import type { Request, Response } from "express";
import { ApiError } from "../../../utils/ApiError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendCreated, sendOk } from "../../../utils/response";
import { TransportService } from "../services/transport.service";

/** The caller's own school, from the signed-in user, never from the request. */
const school = (req: Request): string => {
  if (!req.user?.tenantId) throw ApiError.forbidden("You do not belong to a school", "FORBIDDEN");
  return req.user.tenantId;
};
const idOf = (req: Request) => (req.validatedParams as { id: string }).id;
const body = (req: Request) => req.validatedBody as never;
const query = (req: Request) => req.validatedQuery as never;

export const getSummary = asyncHandler(async (req: Request, res: Response) => sendOk(res, await TransportService.summary(school(req))));

export const listVehicles = asyncHandler(async (req: Request, res: Response) => sendOk(res, await TransportService.listVehicles(school(req), query(req))));
export const createVehicle = asyncHandler(async (req: Request, res: Response) => sendCreated(res, await TransportService.createVehicle(school(req), body(req)), "Vehicle added"));
export const updateVehicle = asyncHandler(async (req: Request, res: Response) => sendOk(res, await TransportService.updateVehicle(school(req), idOf(req), body(req)), "Vehicle saved"));
export const deleteVehicle = asyncHandler(async (req: Request, res: Response) => {
  await TransportService.deleteVehicle(school(req), idOf(req));
  return sendOk(res, null, "Vehicle removed");
});

export const listCrew = asyncHandler(async (req: Request, res: Response) => sendOk(res, await TransportService.listCrew(school(req), query(req))));
export const createCrew = asyncHandler(async (req: Request, res: Response) => sendCreated(res, await TransportService.createCrew(school(req), body(req)), "Added"));
export const updateCrew = asyncHandler(async (req: Request, res: Response) => sendOk(res, await TransportService.updateCrew(school(req), idOf(req), body(req)), "Saved"));
export const deleteCrew = asyncHandler(async (req: Request, res: Response) => {
  await TransportService.deleteCrew(school(req), idOf(req));
  return sendOk(res, null, "Removed");
});

export const listRoutes = asyncHandler(async (req: Request, res: Response) => sendOk(res, await TransportService.listRoutes(school(req), query(req))));
export const createRoute = asyncHandler(async (req: Request, res: Response) => sendCreated(res, await TransportService.createRoute(school(req), body(req)), "Route added"));
export const updateRoute = asyncHandler(async (req: Request, res: Response) => sendOk(res, await TransportService.updateRoute(school(req), idOf(req), body(req)), "Route saved"));
export const deleteRoute = asyncHandler(async (req: Request, res: Response) => {
  await TransportService.deleteRoute(school(req), idOf(req));
  return sendOk(res, null, "Route removed");
});
