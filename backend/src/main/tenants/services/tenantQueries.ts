import { AuthToken } from "../../auth/models/AuthToken";
import { User } from "../../users/models/User";
import { APPROVAL_STATUSES, Tenant, type ApprovalStatus, type ITenant, type TenantSource } from "../models/Tenant";
import type { ListTenantsQuery } from "../schemas/tenants.schemas";

/** One row of the super admin's schools table. */
export interface TenantListItem {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  subscriptionTier: string;
  approvalStatus: ApprovalStatus;
  source: TenantSource;
  adminName: string | null;
  adminEmail: string | null;
  contactEmail: string;
  /** Only while the school is still "invited". */
  inviteExpiresAt: string | null;
  submittedAt: string | null;
  resubmittedCount: number;
  createdAt: string;
}

/** `suspended` is counted on top of the stages: a suspended school is still an approved one. */
export type StatusCounts = Record<ApprovalStatus, number> & { total: number; suspended: number };

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function toListItems(tenants: ITenant[]): Promise<TenantListItem[]> {
  const ids = tenants.map((t) => t._id);
  const [admins, invites] = await Promise.all([
    User.find({ tenantId: { $in: ids }, role: "school_admin" }).select("name email tenantId").lean(),
    AuthToken.find({ tenantId: { $in: ids }, type: "school_invite", usedAt: null }).select("tenantId expiresAt").lean(),
  ]);
  const adminByTenant = new Map(admins.map((a) => [a.tenantId!.toString(), a]));
  const inviteByTenant = new Map(invites.map((i) => [i.tenantId!.toString(), i]));

  return tenants.map((t) => {
    const admin = adminByTenant.get(t._id.toString());
    const invite = inviteByTenant.get(t._id.toString());
    return {
      id: t._id.toString(),
      name: t.name,
      slug: t.slug,
      isActive: t.isActive,
      subscriptionTier: t.subscriptionTier,
      approvalStatus: t.approvalStatus,
      source: t.source ?? "invite",
      adminName: admin?.name ?? null,
      adminEmail: admin?.email ?? null,
      contactEmail: t.contactEmail,
      inviteExpiresAt: t.approvalStatus === "invited" && invite ? invite.expiresAt.toISOString() : null,
      submittedAt: t.onboarding?.submittedAt ? t.onboarding.submittedAt.toISOString() : null,
      resubmittedCount: t.onboarding?.resubmittedCount ?? 0,
      createdAt: t.createdAt.toISOString(),
    };
  });
}

export async function listTenants(query: ListTenantsQuery): Promise<TenantListItem[]> {
  const filter: Record<string, unknown> = {};
  if (query.approvalStatus) filter.approvalStatus = query.approvalStatus;
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), "i");
    filter.$or = [{ name: rx }, { contactEmail: rx }];
  }
  // Newest first. The schools screen puts the ones waiting for a decision on top.
  const tenants = await Tenant.find(filter).sort({ createdAt: -1 }).limit(500).lean();
  return toListItems(tenants);
}

export async function statusCounts(): Promise<StatusCounts> {
  const [rows, suspended] = await Promise.all([
    Tenant.aggregate<{ _id: ApprovalStatus; n: number }>([{ $group: { _id: "$approvalStatus", n: { $sum: 1 } } }]),
    Tenant.countDocuments({ isActive: false }),
  ]);
  const counts = Object.fromEntries(APPROVAL_STATUSES.map((s) => [s, 0])) as Record<ApprovalStatus, number>;
  for (const row of rows) counts[row._id] = row.n;
  return { ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0), suspended };
}

/** Everything the super admin's dashboard needs in one request. */
export async function overview(): Promise<{ counts: StatusCounts; awaiting: TenantListItem[]; recent: TenantListItem[] }> {
  const [counts, awaiting, recent] = await Promise.all([
    statusCounts(),
    Tenant.find({ approvalStatus: "pending" }).sort({ "onboarding.submittedAt": 1 }).limit(6).lean(),
    Tenant.find({}).sort({ createdAt: -1 }).limit(6).lean(),
  ]);
  const [awaitingItems, recentItems] = await Promise.all([toListItems(awaiting), toListItems(recent)]);
  return { counts, awaiting: awaitingItems, recent: recentItems };
}
