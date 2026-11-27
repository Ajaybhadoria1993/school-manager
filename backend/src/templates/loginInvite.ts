import { env } from "../config/env";
import { escapeHtml, renderEmailLayout } from "./layout";

/** The invitation a teacher or a staff member gets when their school gives them a login: a link to choose their password. */
export function loginInviteEmail(params: { name: string; schoolName: string; email: string; inviteUrl: string; ttlHours: number }) {
  const html = renderEmailLayout({
    preheader: `${params.schoolName} has given you a login on ${env.appName}`,
    heading: `Your login for ${params.schoolName}`,
    bodyHtml: `<p>Hi ${escapeHtml(params.name)},</p>
      <p><strong>${escapeHtml(params.schoolName)}</strong> has given you a login on ${escapeHtml(env.appName)}.
      Choose a password, then sign in with this email (<strong>${escapeHtml(params.email)}</strong>) and that password.</p>
      <p>This link works once and is valid for <strong>${params.ttlHours} hours</strong>. If it expires, ask your school to send it again.</p>`,
    button: { label: "Set my password", url: params.inviteUrl },
    footerNote: "If you were not expecting this, you can ignore this email.",
  });

  const text = `Hi ${params.name},\n\n${params.schoolName} has given you a login on ${env.appName}. Choose your password (link works once, valid for ${params.ttlHours} hours):\n${params.inviteUrl}\n\nThen sign in with ${params.email} and that password.\n\nIf you were not expecting this, ignore this email.`;

  return { subject: `${params.schoolName}: set your ${env.appName} password`, html, text };
}
