import { env } from "../config/env";
import { escapeHtml, renderEmailLayout } from "./layout";

export function passwordResetEmail(params: { name: string; resetUrl: string; ttlMinutes: number }) {
  const html = renderEmailLayout({
    preheader: "Reset your password",
    heading: "Reset your password",
    bodyHtml: `<p>Hi ${escapeHtml(params.name)},</p>
      <p>We received a request to reset the password for your ${escapeHtml(env.appName)} account.
      This link works once and expires in <strong>${params.ttlMinutes} minutes</strong>.</p>`,
    button: { label: "Choose a new password", url: params.resetUrl },
    footerNote: "If you did not ask for this, you can ignore this email. Your password will stay as it is.",
  });

  const text = `Hi ${params.name},\n\nUse this link to reset your ${env.appName} password (valid for ${params.ttlMinutes} minutes, works once):\n${params.resetUrl}\n\nIf you did not ask for this, ignore this email.`;

  return { subject: `Reset your ${env.appName} password`, html, text };
}
