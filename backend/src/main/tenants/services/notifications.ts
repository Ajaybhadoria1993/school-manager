import { env } from "../../../config/env";
import { sendEmail } from "../../../utils/email";
import { logger } from "../../../utils/logger";
import {
  schoolApprovedEmail,
  schoolAwaitingApprovalEmail,
  schoolReactivatedEmail,
  schoolRejectedEmail,
  schoolSuspendedEmail,
} from "../../../templates/schoolEmails";
import { User } from "../../users/models/User";
import type { ITenant } from "../models/Tenant";

/**
 * Emails about a school's journey. All fire-and-forget: a mail problem must never undo a decision
 * or block a request, so failures are only logged. (Invitations are different: those are awaited,
 * because the super admin needs to know if one did not go out.)
 */
function send(to: string, mail: { subject: string; html: string; text: string }, devPreview?: string): void {
  sendEmail({ to, ...mail, devPreview }).catch((err) => logger.error(`Failed to send "${mail.subject}"`, err));
}

const loginUrl = () => `${env.clientUrls[0]}/login`;

/** Tells every active super admin that a school is ready for review. */
export async function notifySuperAdminsOfSubmission(
  tenant: ITenant,
  admin: { name: string; email: string },
  resubmitted: boolean
): Promise<void> {
  const superAdmins = await User.find({ role: "super_admin", isActive: true }).select("email").lean();
  const reviewUrl = `${env.clientUrls[0]}/super-admin/schools/${tenant._id.toString()}`;
  const mail = schoolAwaitingApprovalEmail({
    schoolName: tenant.name,
    adminName: admin.name,
    adminEmail: admin.email,
    reviewUrl,
    resubmitted,
  });
  for (const sa of superAdmins) send(sa.email, mail, `Review link for ${tenant.name}: ${reviewUrl}`);
}

export function notifySchoolApproved(tenant: ITenant, admin: { name: string; email: string }): void {
  send(admin.email, schoolApprovedEmail({ schoolName: tenant.name, adminName: admin.name, loginUrl: loginUrl() }));
}

export function notifySchoolRejected(tenant: ITenant, admin: { name: string; email: string }, reason: string): void {
  send(admin.email, schoolRejectedEmail({ schoolName: tenant.name, adminName: admin.name, reason, loginUrl: loginUrl() }));
}

export function notifySchoolSuspended(tenant: ITenant, admin: { name: string; email: string }, reason: string): void {
  send(admin.email, schoolSuspendedEmail({ schoolName: tenant.name, adminName: admin.name, reason }));
}

export function notifySchoolReactivated(tenant: ITenant, admin: { name: string; email: string }): void {
  send(admin.email, schoolReactivatedEmail({ schoolName: tenant.name, adminName: admin.name, loginUrl: loginUrl() }));
}
