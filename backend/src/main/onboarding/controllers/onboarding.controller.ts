import { Request, Response } from "express";
import { ApiError } from "../../../utils/ApiError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendOk } from "../../../utils/response";
import { OnboardingService } from "../services/onboarding.service";
import type { Step1Input } from "../schemas/onboarding.schemas";

/** The school admin's own school, taken from the signed-in user, never from the request. */
function caller(req: Request) {
  if (!req.user?.tenantId) throw ApiError.forbidden("You do not belong to a school", "FORBIDDEN");
  return { userId: req.user.userId, tenantId: req.user.tenantId };
}

export const getOnboarding = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await OnboardingService.getState(caller(req)));
});

export const saveStep = asyncHandler(async (req: Request, res: Response) => {
  const { step } = req.validatedParams as { step: number };
  return sendOk(res, await OnboardingService.saveStep(caller(req), step, req.body), "Saved");
});

export const updateSchoolProfile = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await OnboardingService.updateSchoolProfile(caller(req), req.validatedBody as Step1Input), "School details saved");
});

export const saveLogo = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await OnboardingService.saveLogo(caller(req), req.file?.buffer), "Saved");
});

export const removeLogo = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await OnboardingService.removeLogo(caller(req)), "Removed");
});

export const submitOnboarding = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await OnboardingService.submit(caller(req)), "Submitted for approval");
});
