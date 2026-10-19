import { env } from "../config/env";
import { escapeHtml, renderEmailLayout } from "./layout";

/** Sent when someone registers a school from the login page: confirm the email, then set a password. */
export function schoolSignupEmail(params: { schoolName: string; signupUrl: string; ttlHours: number }) {
  const html = renderEmailLayout({
    preheader: `Confirm your email to register ${params.schoolName}`,
    heading: "Confirm your email",
    bodyHtml: `<p>Hello,</p>
      <p>Thanks for registering <strong>${escapeHtml(params.schoolName)}</strong> on ${escapeHtml(env.appName)}.
      Confirm your email address and choose a password to create your administrator account.
      Then you will be asked a few details about the school, which our team reviews before your dashboard opens.</p>
      <p>This link works once and is valid for <strong>${params.ttlHours} hours</strong>.</p>`,
    button: { label: "Confirm email and continue", url: params.signupUrl },
    footerNote: "If you did not try to register a school, you can ignore this email. No account is created until you open the link.",
  });
  const text = `Confirm your email to register ${params.schoolName} on ${env.appName} (link works once, valid for ${params.ttlHours} hours):\n${params.signupUrl}\n\nIf you did not try to register, ignore this email.`;
  return { subject: `Confirm your email to register ${params.schoolName}`, html, text };
}

/** Sent instead of a sign-up link when the email already has an account or a registration in progress. */
export function alreadyRegisteredEmail(params: { loginUrl: string }) {
  const html = renderEmailLayout({
    preheader: "You already have an account",
    heading: "You already have an account",
    bodyHtml: `<p>Hello,</p>
      <p>Someone, hopefully you, tried to register a school on ${escapeHtml(env.appName)} with this email address,
      but it is already linked to an account or to a registration in progress.</p>
      <p>Sign in to continue where you left off. If you forgot your password, use <em>Forgot password</em> on the sign-in page.
      If you were invited by the platform team, use the invitation email you received.</p>`,
    button: { label: "Go to sign in", url: params.loginUrl },
    footerNote: "If this was not you, you can ignore this email. Nothing was changed.",
  });
  const text = `This email already has an account or a registration in progress on ${env.appName}. Sign in: ${params.loginUrl}`;
  return { subject: `You already have an account on ${env.appName}`, html, text };
}

/** To the platform team: a school finished onboarding and waits for a decision. */
export function schoolAwaitingApprovalEmail(params: {
  schoolName: string;
  adminName: string;
  adminEmail: string;
  reviewUrl: string;
  resubmitted: boolean;
}) {
  const html = renderEmailLayout({
    preheader: `${params.schoolName} is waiting for approval`,
    heading: params.resubmitted ? "A school was resubmitted" : "A school is waiting for approval",
    bodyHtml: `<p><strong>${escapeHtml(params.schoolName)}</strong> ${
      params.resubmitted ? "fixed the points you raised and submitted again" : "finished onboarding and submitted its details"
    }.</p>
      <p>Administrator: ${escapeHtml(params.adminName)} (${escapeHtml(params.adminEmail)})</p>
      <p>Review the details and approve or reject the school.</p>`,
    button: { label: "Review school", url: params.reviewUrl },
  });
  const text = `${params.schoolName} ${params.resubmitted ? "was resubmitted" : "is waiting for approval"}. Administrator: ${params.adminName} (${params.adminEmail}). Review: ${params.reviewUrl}`;
  return { subject: `${params.resubmitted ? "Resubmitted" : "New school"}: ${params.schoolName} awaits approval`, html, text };
}

export function schoolApprovedEmail(params: { schoolName: string; adminName: string; loginUrl: string }) {
  const html = renderEmailLayout({
    preheader: `${params.schoolName} is approved`,
    heading: `${params.schoolName} is approved`,
    bodyHtml: `<p>Hi ${escapeHtml(params.adminName)},</p>
      <p>Good news: your school has been approved on ${escapeHtml(env.appName)}. Sign in to open your dashboard.</p>`,
    button: { label: "Open my dashboard", url: params.loginUrl },
  });
  const text = `Hi ${params.adminName}, ${params.schoolName} has been approved on ${env.appName}. Sign in: ${params.loginUrl}`;
  return { subject: `${params.schoolName} is approved on ${env.appName}`, html, text };
}

export function schoolRejectedEmail(params: { schoolName: string; adminName: string; reason: string; loginUrl: string }) {
  const html = renderEmailLayout({
    preheader: `${params.schoolName} needs changes`,
    heading: "Your school needs a few changes",
    bodyHtml: `<p>Hi ${escapeHtml(params.adminName)},</p>
      <p>We could not approve <strong>${escapeHtml(params.schoolName)}</strong> yet. The reviewer wrote:</p>
      <blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #d92d20;background:#fdedec;border-radius:4px;">${escapeHtml(params.reason)}</blockquote>
      <p>Sign in, update the details and submit again. Nothing you entered was lost.</p>`,
    button: { label: "Update and resubmit", url: params.loginUrl },
  });
  const text = `Hi ${params.adminName}, ${params.schoolName} could not be approved yet.\n\nReviewer's note: ${params.reason}\n\nSign in, update the details and submit again: ${params.loginUrl}`;
  return { subject: `${params.schoolName} needs changes before approval`, html, text };
}

export function schoolSuspendedEmail(params: { schoolName: string; adminName: string; reason: string }) {
  const html = renderEmailLayout({
    preheader: `${params.schoolName} has been suspended`,
    heading: "Your school has been suspended",
    bodyHtml: `<p>Hi ${escapeHtml(params.adminName)},</p>
      <p>Access to <strong>${escapeHtml(params.schoolName)}</strong> on ${escapeHtml(env.appName)} has been switched off. Nobody from the school can sign in for now. The platform team wrote:</p>
      <blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #d92d20;background:#fdedec;border-radius:4px;">${escapeHtml(params.reason)}</blockquote>
      <p>Nothing was deleted: your data is safe. Please contact the platform team to sort this out. You will get another email as soon as the school is switched back on.</p>`,
    footerNote: "You are getting this email because you are the administrator of this school.",
  });
  const text = `Hi ${params.adminName}, ${params.schoolName} has been suspended on ${env.appName}. Nobody from the school can sign in for now.\n\nThe platform team wrote: ${params.reason}\n\nNothing was deleted. Please contact the platform team. You will get another email when the school is switched back on.`;
  return { subject: `${params.schoolName} has been suspended`, html, text };
}

export function schoolReactivatedEmail(params: { schoolName: string; adminName: string; loginUrl: string }) {
  const html = renderEmailLayout({
    preheader: `${params.schoolName} is active again`,
    heading: "Your school is active again",
    bodyHtml: `<p>Hi ${escapeHtml(params.adminName)},</p>
      <p><strong>${escapeHtml(params.schoolName)}</strong> is switched back on, and everything is as you left it. Please sign in again.</p>`,
    button: { label: "Sign in", url: params.loginUrl },
  });
  const text = `Hi ${params.adminName}, ${params.schoolName} is active again on ${env.appName}. Please sign in again: ${params.loginUrl}`;
  return { subject: `${params.schoolName} is active again`, html, text };
}
