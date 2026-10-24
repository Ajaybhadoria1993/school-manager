import nodemailer, { type Transporter } from "nodemailer";
import { env, isEmailConfigured } from "../config/env";
import { logger } from "./logger";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /**
   * Only used when SMTP is not configured and the server is NOT in production: this line is
   * printed to the console so a developer can click the link without a mailbox.
   * It is never logged in production.
   */
  devPreview?: string;
}

export interface EmailResult {
  delivered: boolean;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    // 465 = implicit TLS (Gmail default); 587 = STARTTLS.
    secure: env.smtp.port === 465,
    auth: { user: env.smtp.user, pass: env.smtp.pass },
  });
  return transporter;
}

const TRANSIENT_CODES = new Set(["ETIMEDOUT", "ECONNECTION", "ECONNRESET", "EAI_AGAIN", "ESOCKET"]);

function isTransient(err: unknown): boolean {
  const e = err as { code?: string; responseCode?: number; status?: number };
  return (
    (e.code !== undefined && TRANSIENT_CODES.has(e.code)) ||
    (e.responseCode !== undefined && [421, 450, 451, 452].includes(e.responseCode)) ||
    // Brevo: rate limited or a server error.
    (e.status !== undefined && (e.status === 429 || e.status >= 500))
  );
}

/** "EduShiksha <school@example.com>" -> { name: "EduShiksha", email: "school@example.com" }. */
function parseSender(from: string): { name: string; email: string } {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  if (match) return { name: match[1] || env.appName, email: match[2].trim() };
  return { name: env.appName, email: from.trim() };
}

async function sendViaBrevo(message: EmailMessage, from: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": env.brevoApiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: parseSender(from),
        to: [{ email: message.to }],
        subject: message.subject,
        htmlContent: message.html,
        ...(message.text ? { textContent: message.text } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    // Network failure or timeout: worth another try.
    throw Object.assign(new Error(`Brevo request failed: ${(err as Error).message}`), { code: "ECONNECTION" });
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw Object.assign(new Error(`Brevo rejected the email (HTTP ${res.status}): ${body.slice(0, 300)}`), {
      status: res.status,
    });
  }
}

/**
 * Sends an email through Brevo's API when BREVO_API_KEY is set, otherwise through SMTP (Gmail by default).
 * With neither configured it only logs, so local work never blocks.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (!isEmailConfigured) {
    logger.warn(`[email] email not configured, NOT sent (to=${message.to}, subject="${message.subject}")`);
    if (!env.isProduction && message.devPreview) logger.info(`[email:dev] ${message.devPreview}`);
    return { delivered: false };
  }

  const from = env.smtp.from || env.smtp.user;
  const maxAttempts = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      if (env.brevoApiKey) {
        await sendViaBrevo(message, from);
      } else {
        await getTransporter().sendMail({
          from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        });
      }
      return { delivered: true };
    } catch (err) {
      if (attempt >= maxAttempts || !isTransient(err)) {
        logger.error(`[email] failed to send (to=${message.to}, subject="${message.subject}")`, err);
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
    }
  }
}

/** Used by `npm run mail:test` to confirm the SMTP login works before sending anything. */
export async function verifySmtp(): Promise<void> {
  await getTransporter().verify();
}
