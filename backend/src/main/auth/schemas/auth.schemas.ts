import { z } from "zod";
import { PASSWORD_POLICY_MESSAGE, PASSWORD_POLICY_REGEX } from "../../../utils/authUtils";

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);

/** A login name: 3 to 30 letters, digits, dots or underscores, starting with a letter (so it can never be read as an email or a number). */
export const USERNAME_REGEX = /^[a-z][a-z0-9._]{2,29}$/;
export const USERNAME_MESSAGE = "A username is 3 to 30 letters, digits, dots or underscores, starting with a letter";
/** A username as typed: spaces round it and capital letters do not matter. */
export const usernameSchema = z.string({ required_error: "Enter a username", invalid_type_error: "Enter a username" }).trim().toLowerCase().regex(USERNAME_REGEX, USERNAME_MESSAGE);

/** What the sign-in box takes: an email, or a username (an email always has the @, a username never can). */
const identifierSchema = z
  .string({ required_error: "Enter your email or username", invalid_type_error: "Enter your email or username" })
  .trim()
  .toLowerCase()
  .max(254, "Enter a valid email address or username")
  .refine((value) => (value.includes("@") ? emailSchema.safeParse(value).success : USERNAME_REGEX.test(value)), "Enter a valid email address or username");

export const passwordSchema = z.string().regex(PASSWORD_POLICY_REGEX, PASSWORD_POLICY_MESSAGE);

export const platformSchema = z.enum(["web", "ios", "android"]);

export const loginSchema = z
  .object({
    identifier: identifierSchema.optional(),
    /** The name the box had before usernames existed: the same thing. */
    email: identifierSchema.optional(),
    // Only "is something there": the real check is the stored hash, and a policy check here would
    // tell an attacker which passwords are not worth trying.
    password: z.string().min(1, "Password is required").max(200),
    device: platformSchema.optional().default("web"),
  })
  .superRefine((value, ctx) => {
    if (value.identifier === undefined && value.email === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["identifier"], message: "Enter your email or username" });
    }
  })
  .transform(({ identifier, email, password, device }) => ({ identifier: (identifier ?? email) as string, password, device }));

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
