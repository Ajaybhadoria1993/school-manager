import { Router } from "express";
import {
  forgotPasswordLimiter,
  inviteLinkLimiter,
  loginIpLimiter,
  loginLimiter,
  refreshLimiter,
  resetPasswordLimiter,
  signupLimiter,
} from "../../../../middleware/rateLimit";
import { requireAuthLoose } from "../../../../middleware/auth";
import { validate } from "../../../../middleware/validate";
import {
  acceptInvite,
  forgotPassword,
  getInvite,
  login,
  logout,
  me,
  refresh,
  resetPassword,
  signup,
} from "../../controllers/auth.controller";
import {
  acceptInviteSchema,
  forgotPasswordSchema,
  inviteTokenSchema,
  loginSchema,
  refreshSchema,
  resetPasswordSchema,
  signupSchema,
} from "../../schemas/auth.schemas";

const router = Router();

// Public
router.post("/login", loginIpLimiter, loginLimiter, validate(loginSchema), login);
router.post("/refresh", refreshLimiter, validate(refreshSchema), refresh);
router.post("/logout", validate(refreshSchema), logout);
router.post("/signup", signupLimiter, validate(signupSchema), signup);
// A POST with the token in the body, not a GET with it in the path: URLs end up in access logs.
router.post("/invite/check", inviteLinkLimiter, validate(inviteTokenSchema), getInvite);
router.post("/accept-invite", inviteLinkLimiter, validate(acceptInviteSchema), acceptInvite);
router.post("/forgot-password", forgotPasswordLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", resetPasswordLimiter, validate(resetPasswordSchema), resetPassword);

// Logged in. Loose: a school that is still being set up or approved must still be able to ask "who am I?".
router.get("/me", requireAuthLoose, me);

export default router;
