/**
 * Sends one test email through the configured SMTP account, to check Gmail works.
 *   npm run mail:test -- someone@example.com
 * Prints only success or the SMTP error: never the password.
 */
import { env, isSmtpConfigured } from "../config/env";
import { sendEmail, verifySmtp } from "../utils/email";
import { escapeHtml, renderEmailLayout } from "../templates/layout";

async function main() {
  const to = process.argv[2];
  if (!to || !to.includes("@")) {
    console.error("Usage: npm run mail:test -- you@example.com");
    process.exit(1);
  }

  if (!isSmtpConfigured) {
    console.error(
      [
        "SMTP is not configured. In backend/.env set:",
        "  SMTP_HOST=smtp.gmail.com",
        "  SMTP_PORT=465",
        "  SMTP_USER=<your gmail address>",
        "  SMTP_PASS=<Gmail App Password: 16 letters, NOT your normal password>",
        "  SMTP_FROM=\"EduShiksha <your gmail address>\"",
        "Create the App Password at https://myaccount.google.com/apppasswords (2-Step Verification must be ON).",
      ].join("\n")
    );
    process.exit(1);
  }

  console.log(`Connecting to ${env.smtp.host}:${env.smtp.port} as ${env.smtp.user} ...`);
  await verifySmtp();
  console.log("SMTP login OK. Sending test email ...");

  await sendEmail({
    to,
    subject: `${env.appName}: test email`,
    html: renderEmailLayout({
      preheader: "SMTP test",
      heading: "Email is working",
      bodyHtml: `<p>This is a test message sent from ${escapeHtml(env.appName)}. If you can read it, outgoing email is set up correctly.</p>`,
    }),
    text: `This is a test message from ${env.appName}. Outgoing email is set up correctly.`,
  });
  console.log(`Sent to ${to}. Check the inbox (and spam folder).`);
}

main().catch((err: { message?: string; code?: string; responseCode?: number }) => {
  console.error(`Failed: ${err.message ?? err} ${err.code ? `(code ${err.code})` : ""}`);
  if (err.responseCode === 535) {
    console.error("Gmail rejected the login. Use an App Password (not your normal password) and make sure 2-Step Verification is on.");
  }
  process.exit(1);
});
