import { z } from "zod";
import { APPROVAL_STATUSES, SUBSCRIPTION_TIERS } from "../models/Tenant";

export const inviteSchoolSchema = z.object({
  schoolName: z.string().trim().min(2, "School name must be at least 2 characters").max(150),
  // The email the school admin will sign in with.
  contactEmail: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  subscriptionTier: z.enum(SUBSCRIPTION_TIERS).optional().default("basic"),
});

export const tenantIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid school id"),
});

export const listTenantsQuerySchema = z.object({
  approvalStatus: z.enum(APPROVAL_STATUSES).optional(),
  search: z.string().trim().max(100).optional(),
});

export const approveSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export const rejectSchema = z.object({
  reason: z.string().trim().min(10, "Tell the school what to fix (at least 10 characters)").max(500, "Keep it under 500 characters"),
});

export const suspendSchema = z.object({
  reason: z.string().trim().min(10, "Tell the school why (at least 10 characters)").max(500, "Keep it under 500 characters"),
});

export const reactivateSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export type InviteSchoolInput = z.infer<typeof inviteSchoolSchema>;
export type ListTenantsQuery = z.infer<typeof listTenantsQuerySchema>;
