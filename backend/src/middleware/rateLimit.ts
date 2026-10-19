import rateLimit, { ipKeyGenerator, type Options } from "express-rate-limit";
import type { Request } from "express";
import { env } from "../config/env";

// Tests switch the limiters off (DISABLE_RATE_LIMIT=1) except the ones that check them.
// Evaluated per request, so a test can flip it at runtime. Never set in production.
const skipForTests = () => process.env.DISABLE_RATE_LIMIT === "1";

const MINUTE = 60 * 1000;

/** Every limiter has its own counter: one busy endpoint must never use up another's allowance. */
function limiter(options: Partial<Options>) {
  return rateLimit({ standardHeaders: true, legacyHeaders: false, skip: skipForTests, ...options });
}

const tooMany = (message: string) => ({ success: false, message, code: "RATE_LIMITED" });

const ipOf = (req: Request) => ipKeyGenerator(req.ip ?? "unknown");

/** The email a login attempt is for, normalised like the validator does (trim + lowercase). */
function attemptedEmail(req: Request): string {
  const email: unknown = req.body?.email;
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

// Generous default so normal dashboard usage (many small GETs) never trips it.
export const apiLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 600,
  message: tooMany("Too many requests, please try again shortly."),
});

// Blunts password guessing against one account. Keyed by IP + attempted email so one slow user on a
// shared IP (a school office behind one router) doesn't lock everyone else out. The email is
// normalised first: "a@x.com", " a@x.com" and "A@X.com " are the same account. Only failures count.
export const loginLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: env.loginRateLimitMax,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ipOf(req)}:${attemptedEmail(req)}`,
  message: tooMany("Too many login attempts. Please wait a few minutes and try again."),
});

// The same guessing spread over many emails from one place (password spraying, or a flood of
// unknown emails, each of which costs a full password hash). Failures only, and roomier than the above.
export const loginIpLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: env.loginRateLimitMax * 3,
  skipSuccessfulRequests: true,
  keyGenerator: ipOf,
  message: tooMany("Too many login attempts from this network. Please wait a few minutes and try again."),
});

// Sending invitations costs real email, so cap it per signed-in user (the route runs after requireAuth).
export const inviteLimiter = limiter({
  windowMs: 60 * MINUTE,
  limit: 30,
  keyGenerator: (req) => `user:${req.user?.userId ?? ipOf(req)}`,
  message: tooMany("Too many invitations in a short time. Please wait a while."),
});

// Registering a school sends an email to any address typed into a public form, so keep it tight per IP.
export const signupLimiter = limiter({
  windowMs: 60 * MINUTE,
  limit: 8,
  message: tooMany("Too many sign-up attempts. Please try again in a while."),
});

// Silent token refresh: every signed-in browser does it about every 15 minutes, and a whole school
// can sit behind one IP, so this is far roomier than the endpoints a person types into.
export const refreshLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 300,
  message: tooMany("Too many requests. Please wait a few minutes and try again."),
});

// "Forgot password" sends email to any address typed into a public form.
export const forgotPasswordLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 10,
  message: tooMany("Too many requests. Please wait a few minutes and try again."),
});

// Setting a new password costs a password hash; the reset token itself cannot be guessed.
export const resetPasswordLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 20,
  message: tooMany("Too many requests. Please wait a few minutes and try again."),
});

// Looking up and accepting an invitation or sign-up link (one-time tokens, so a handful per IP is plenty).
export const inviteLinkLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: 30,
  message: tooMany("Too many requests. Please wait a few minutes and try again."),
});
