import { env } from "../config/env";
import { escapeHtml, renderEmailLayout } from "./layout";

export function schoolInviteEmail(params: { schoolName: string; inviteUrl: string; ttlHours: number }) {
  const html = renderEmailLayout({
    preheader: `Set up ${params.schoolName} on ${env.appName}`,
    heading: `Set up ${params.schoolName}`,
    bodyHtml: `<p>Hello,</p>
      <p>You have been invited to manage <strong>${escapeHtml(params.schoolName)}</strong> on ${escapeHtml(env.appName)}.
      Choose a password to create your administrator account, then you will be asked a few details about the school.</p>
      <p>This link works once and is valid for <strong>${params.ttlHours} hours</strong>.</p>`,
    button: { label: "Create my account", url: params.inviteUrl },
    footerNote: "If you were not expecting this invitation, you can ignore this email. No account is created until you open the link.",
  });

  const text = `You have been invited to manage ${params.schoolName} on ${env.appName}.\n\nCreate your account (link works once, valid for ${params.ttlHours} hours):\n${params.inviteUrl}\n\nIf you were not expecting this, ignore this email.`;

  return { subject: `You're invited to set up ${params.schoolName} on ${env.appName}`, html, text };
}
