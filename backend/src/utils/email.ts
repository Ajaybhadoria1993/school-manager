import nodemailer, { type Transporter } from "nodemailer";
import { env, isSmtpConfigured } from "../config/env";
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
  const e = err as { code?: string; responseCode?: number };
  return (
    (e.code !== undefined && TRANSIENT_CODES.has(e.code)) ||
    (e.responseCode !== undefined && [421, 450, 451, 452].includes(e.responseCode))
  );
}

/** Sends an email through SMTP (Gmail by default). Without SMTP settings it only logs, so local work never blocks. */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  if (!isSmtpConfigured) {
    logger.warn(`[email] SMTP not configured, email NOT sent (to=${message.to}, subject="${message.subject}")`);
    if (!env.isProduction && message.devPreview) logger.info(`[email:dev] ${message.devPreview}`);
    return { delivered: false };
  }

  const from = env.smtp.from || env.smtp.user;
  const maxAttempts = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      await getTransporter().sendMail({
        from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
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
