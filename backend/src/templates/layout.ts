import { env } from "../config/env";

/** Every value interpolated into an email goes through this; never concatenate user text raw. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface EmailLayoutOptions {
  preheader: string;
  heading: string;
  /** Already-safe HTML (build it with escapeHtml for any dynamic text). */
  bodyHtml: string;
  button?: { label: string; url: string };
  footerNote?: string;
}

export function renderEmailLayout({ preheader, heading, bodyHtml, button, footerNote }: EmailLayoutOptions): string {
  const appName = escapeHtml(env.appName);
  const buttonHtml = button
    ? `<p style="margin:28px 0;">
         <a href="${escapeHtml(button.url)}" style="background:#4338ca;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block;">${escapeHtml(button.label)}</a>
       </p>
       <p style="font-size:13px;color:#62667a;">If the button does not work, copy and paste this link into your browser:<br>
         <span style="word-break:break-all;color:#4338ca;">${escapeHtml(button.url)}</span>
       </p>`
    : "";

  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#f6f7fb;font-family:Arial,Helvetica,sans-serif;color:#14151f;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e4e6ef;">
        <tr><td style="padding:28px 32px 8px;font-size:15px;font-weight:700;color:#4338ca;">${appName}</td></tr>
        <tr><td style="padding:8px 32px 28px;">
          <h1 style="font-size:20px;margin:8px 0 16px;">${escapeHtml(heading)}</h1>
          <div style="font-size:15px;line-height:1.6;">${bodyHtml}</div>
          ${buttonHtml}
          ${footerNote ? `<p style="font-size:13px;color:#62667a;margin-top:24px;">${escapeHtml(footerNote)}</p>` : ""}
        </td></tr>
      </table>
      <p style="font-size:12px;color:#62667a;margin-top:16px;">${appName}</p>
    </td></tr>
  </table>
</body>
</html>`;
}
