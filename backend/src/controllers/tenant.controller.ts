import { Request, Response } from "express";
import { z } from "zod";
import { Tenant } from "../models/Tenant";
import { Branch } from "../models/Branch";
import { User, hashPassword } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

const onboardSchema = z.object({
  tenantName: z.string().min(2),
  subscriptionTier: z.enum(["basic", "standard", "premium"]).default("basic"),
  contactEmail: z.string().email(),
  contactPhone: z.string().min(6),
  branch: z.object({
    name: z.string().min(2),
    code: z.string().min(1),
    board: z.enum(["CBSE", "ICSE", "State Board", "IB", "Other"]),
  }),
  admin: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(6),
    password: z.string().min(6),
  }),
});

// Super Admin onboarding wizard (FR-10.1): creates an isolated tenant, its
// first branch, and the initial School Admin login in a single transaction-like
// sequence. Any later modules stay hidden per tenant via Tenant.modules toggles.
export const onboardTenant = asyncHandler(async (req: Request, res: Response) => {
  const payload = onboardSchema.parse(req.body);

  const slug = payload.tenantName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const existing = await Tenant.findOne({ slug });
  if (existing) throw ApiError.conflict("A school with a similar name is already onboarded");

  const tenant = await Tenant.create({
    name: payload.tenantName,
    slug,
    subscriptionTier: payload.subscriptionTier,
    contactEmail: payload.contactEmail,
    contactPhone: payload.contactPhone,
  });

  const branch = await Branch.create({
    tenantId: tenant._id,
    name: payload.branch.name,
    code: payload.branch.code.toUpperCase(),
    board: payload.branch.board,
  });

  const passwordHash = await hashPassword(payload.admin.password);
  const admin = await User.create({
    name: payload.admin.name,
    email: payload.admin.email.toLowerCase(),
    phone: payload.admin.phone,
    passwordHash,
    role: "school_admin",
    tenantId: tenant._id,
    branchId: branch._id,
  });

  res.status(201).json({
    success: true,
    data: {
      tenant,
      branch,
      admin: { id: admin._id, email: admin.email, name: admin.name },
    },
  });
});

export const listTenants = asyncHandler(async (_req: Request, res: Response) => {
  const tenants = await Tenant.find().sort({ createdAt: -1 });
  res.json({ success: true, data: tenants });
});

const updateStatusSchema = z.object({
  isActive: z.boolean().optional(),
  subscriptionTier: z.enum(["basic", "standard", "premium"]).optional(),
  modules: z
    .object({
      academics: z.boolean().optional(),
      fees: z.boolean().optional(),
      attendance: z.boolean().optional(),
      communication: z.boolean().optional(),
      certificates: z.boolean().optional(),
      transport: z.boolean().optional(),
    })
    .optional(),
});

// FR-10.2 (activate/deactivate + tier) and FR-10.3 (per-module feature toggle)
export const updateTenant = asyncHandler(async (req: Request, res: Response) => {
  const payload = updateStatusSchema.parse(req.body);
  const update: Record<string, unknown> = {};
  if (payload.isActive !== undefined) update.isActive = payload.isActive;
  if (payload.subscriptionTier) update.subscriptionTier = payload.subscriptionTier;
  if (payload.modules) {
    for (const [key, value] of Object.entries(payload.modules)) {
      if (value !== undefined) update[`modules.${key}`] = value;
    }
  }

  const tenant = await Tenant.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!tenant) throw ApiError.notFound("Tenant not found");
  res.json({ success: true, data: tenant });
});
