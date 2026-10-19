import { Request, Response } from "express";
import { env } from "../../../config/env";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendCreated, sendOk } from "../../../utils/response";
import { ApiError } from "../../../utils/ApiError";
import type { Platform } from "../../../utils/authUtils";
import type { AcceptInviteInput, LoginInput, ResetPasswordInput, SignupInput } from "../schemas/auth.schemas";
import { SignupService } from "../services/signup.service";
import { AcceptInviteService } from "../services/acceptInvite.service";
import { AuthService } from "../services/auth.service";
import { PasswordService } from "../services/password.service";
import type { SessionMeta } from "../services/token.service";

function sessionMeta(req: Request, platform?: Platform): SessionMeta {
  return { platform, userAgent: req.headers["user-agent"], ipAddress: req.ip };
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, device } = req.validatedBody as LoginInput;
  const session = await AuthService.login(email, password, sessionMeta(req, device));
  return sendOk(res, session);
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.validatedBody as { refreshToken: string };
  const tokens = await AuthService.refresh(refreshToken, sessionMeta(req));
  return sendOk(res, tokens);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.validatedBody as { refreshToken: string };
  await AuthService.logout(refreshToken);
  return sendOk(res, {}, "Signed out");
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized("Authentication required");
  return sendOk(res, await AuthService.me(req.user.userId));
});

export const signup = asyncHandler(async (req: Request, res: Response) => {
  const { schoolName, email } = req.validatedBody as SignupInput;
  await SignupService.requestSignup(schoolName, email);
  // The same answer whatever happened, so the page can state how long the link will work.
  return sendOk(res, { ttlHours: env.signupTokenTtlHours }, "If this email can be used, we have sent a link to continue.");
});

export const getInvite = asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.validatedBody as { token: string };
  return sendOk(res, await AcceptInviteService.validate(token));
});

export const acceptInvite = asyncHandler(async (req: Request, res: Response) => {
  const { token, name, password, device } = req.validatedBody as AcceptInviteInput;
  const session = await AcceptInviteService.accept(token, name, password, sessionMeta(req, device));
  return sendCreated(res, session, "Account created");
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.validatedBody as { email: string };
  PasswordService.queueReset(email);
  return sendOk(
    res,
    { ttlMinutes: env.passwordResetTtlMinutes },
    "If an account exists for that email, a reset link has been sent."
  );
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { token, newPassword, device } = req.validatedBody as ResetPasswordInput;
  const session = await PasswordService.resetPassword(token, newPassword, sessionMeta(req, device));
  return sendOk(res, session, "Password updated");
});
