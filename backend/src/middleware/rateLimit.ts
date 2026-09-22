import rateLimit, { ipKeyGenerator } from "express-rate-limit";

// Generous default so normal dashboard usage (many small GETs) never trips it.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again shortly." },
});

// Tighter limit specifically on login to blunt password-guessing attempts,
// keyed by IP + attempted email so one slow user on a shared IP (school
// office NAT) doesn't lock out everyone else.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "unknown")}:${String(req.body?.email ?? "")}`,
  message: { success: false, message: "Too many login attempts. Please wait a few minutes and try again." },
});
