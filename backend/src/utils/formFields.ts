import { z } from "zod";

/**
 * Small Zod building blocks for boxes a person fills in, shared by every form of the API (onboarding, admissions...), so the same
 * kind of box is read and checked the same way everywhere.
 */

/**
 * An optional form field: an empty box (or null) means "not given", but a filled box must be valid,
 * with its own error message. (A plain `.optional()` would reject "" and a union would hide the message.)
 */
export const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === null || (typeof v === "string" && v.trim() === "") ? undefined : v), schema.optional());

/** An Indian mobile number: 10 digits, the first one 6 to 9. */
export const INDIAN_MOBILE = /^[6-9]\d{9}$/;

/**
 * An Indian number as the 10 digits after +91, whichever way it was typed: "+91 98765 43210",
 * "09876543210" (the trunk 0), "0755-2345678" (a landline with its STD code), or the digits alone.
 */
export const nationalNumber = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  let digits = value.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+91")) digits = digits.slice(3);
  else if (/^91\d{10}$/.test(digits)) digits = digits.slice(2);
  else if (/^0\d{10}$/.test(digits)) digits = digits.slice(1);
  return digits;
};

/** A phone number stored as its 10 national digits (see nationalNumber); `pattern` narrows it, for example to a mobile. */
export const phoneNumber = (message: string, pattern = /^\d{10}$/) => z.preprocess(nationalNumber, z.string().regex(pattern, message));
