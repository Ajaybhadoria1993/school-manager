import { env, isSmtpConfigured } from "../../../config/env";
import { ApiError } from "../../../utils/ApiError";
import { generateToken, hashToken } from "../../../utils/authUtils";
import { sendEmail } from "../../../utils/email";
import { logger } from "../../../utils/logger";
import { schoolInviteEmail } from "../../../templates/schoolInvite";
import { AuthToken } from "../../auth/models/AuthToken";
import { User } from "../../users/models/User";
import { Tenant, type ApprovalStatus, type ITenant } from "../models/Tenant";
import type { InviteSchoolInput } from "../schemas/tenants.schemas";
import { toListItems, type TenantListItem } from "./tenantQueries";
import { createTenant } from "./tenantFactory";

const OPEN_STATES: ApprovalStatus[] = ["invited", "onboarding", "pending"];

export interface InviteDelivery {
  inviteExpiresAt: string;
  /** False when the email could not be handed to the mail server: the super admin should use "Resend". */
  emailSent: boolean;
  /** Development convenience only: present when SMTP is not configured AND the server is not in production. */
  devInviteLink?: string;
}

function inviteUrl(rawToken: string): string {
  return `${env.clientUrls[0]}/accept-invite?token=${rawToken}`;
}

export class InviteService {
  /** Creates the school in "invited" state and emails its future admin a one-time link. */
  static async inviteSchool(
    input: InviteSchoolInput,
    invitedBy: string
  ): Promise<{ tenant: TenantListItem } & InviteDelivery> {
    const { schoolName, contactEmail, subscriptionTier } = input;

    if (await User.exists({ email: contactEmail })) {
      throw ApiError.conflict("A user with this email already exists.", "EMAIL_IN_USE");
    }
    if (await Tenant.exists({ contactEmail, approvalStatus: { $in: OPEN_STATES } })) {
      throw ApiError.conflict(
        "This email already has a school invitation or registration in progress. Use Resend invite on that school instead.",
        "EMAIL_IN_USE"
      );
    }

    const tenant = await createTenant({
      name: schoolName,
      contactEmail,
      approvalStatus: "invited",
      source: "invite",
      subscriptionTier,
      invitedBy,
    });

    let delivery: InviteDelivery;
    try {
      delivery = await InviteService.issueAndSend(tenant);
    } catch (err) {
      await Tenant.deleteOne({ _id: tenant._id }); // do not leave a school nobody can ever be invited to
      throw err;
    }

    return { tenant: (await toListItems([tenant]))[0], ...delivery };
  }

  /** A fresh link for a school whose invite was lost or expired. The previous link stops working. */
  static async resendInvite(tenantId: string): Promise<InviteDelivery> {
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) throw ApiError.notFound("School not found", "NOT_FOUND");
    if (tenant.approvalStatus !== "invited") {
      throw ApiError.conflict("This school has already accepted its invitation.", "INVALID_STATE");
    }
    return InviteService.issueAndSend(tenant);
  }

  /** Replaces any open invite for the school with a new token and emails it. */
  private static async issueAndSend(tenant: ITenant): Promise<InviteDelivery> {
    await AuthToken.deleteMany({ tenantId: tenant._id, type: "school_invite", usedAt: null });

    const rawToken = generateToken();
    const expiresAt = new Date(Date.now() + env.inviteTokenTtlHours * 60 * 60 * 1000);
    await AuthToken.create({
      type: "school_invite",
      tokenHash: hashToken(rawToken),
      tenantId: tenant._id,
      email: tenant.contactEmail,
      expiresAt,
    });

    const url = inviteUrl(rawToken);
    const mail = schoolInviteEmail({ schoolName: tenant.name, inviteUrl: url, ttlHours: env.inviteTokenTtlHours });

    let emailSent = true;
    try {
      const result = await sendEmail({
        to: tenant.contactEmail,
        ...mail,
        devPreview: `Invite link for ${tenant.contactEmail} (${tenant.name}): ${url}`,
      });
      emailSent = result.delivered;
    } catch (err) {
      logger.error("Failed to send school invite email", err);
      emailSent = false;
    }

    return {
      inviteExpiresAt: expiresAt.toISOString(),
      emailSent,
      ...(!isSmtpConfigured && !env.isProduction ? { devInviteLink: url } : {}),
    };
  }
}
