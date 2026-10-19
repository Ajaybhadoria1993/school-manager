import { z } from "zod";
import { PASSWORD_POLICY_MESSAGE, PASSWORD_POLICY_REGEX } from "../../../utils/authUtils";

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

export const passwordSchema = z.string().regex(PASSWORD_POLICY_REGEX, PASSWORD_POLICY_MESSAGE);

export const platformSchema = z.enum(["web", "ios", "android"]);

export const loginSchema = z.object({
  email: emailSchema,
  // Only "is something there": the real check is the stored hash, and a policy check here would
  // tell an attacker which passwords are not worth trying.
  password: z.string().min(1, "Password is required").max(200),
  device: platformSchema.optional().default("web"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required").max(2000),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required").max(200),
  newPassword: passwordSchema,
  device: platformSchema.optional().default("web"),
});

export const signupSchema = z.object({
  schoolName: z.string().trim().min(2, "Enter the school name").max(150),
  email: emailSchema,
});

export const inviteTokenSchema = z.object({
  token: z.string().min(1, "Invitation token is required").max(200),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(1, "Invitation token is required").max(200),
  name: z.string().trim().min(2, "Enter your full name").max(100),
  password: passwordSchema,
  device: platformSchema.optional().default("web"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
