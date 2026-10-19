import { env } from "../../../config/env";
import { generateToken, hashToken } from "../../../utils/authUtils";
import { sendEmail } from "../../../utils/email";
import { logger } from "../../../utils/logger";
import { alreadyRegisteredEmail, schoolSignupEmail } from "../../../templates/schoolEmails";
import { Tenant } from "../../tenants/models/Tenant";
import { SCHOOL_EXISTS, nameKeyOf } from "../../tenants/services/tenantFactory";
import { User } from "../../users/models/User";
import { AuthToken } from "../models/AuthToken";

/** Asking again within this window sends nothing (stops the form being used to flood an inbox). */
const RESEND_COOLDOWN_MS = 60 * 1000;

function fireAndForget(to: string, mail: { subject: string; html: string; text: string }, devPreview?: string): void {
  sendEmail({ to, ...mail, devPreview }).catch((err) => logger.error(`Failed to send "${mail.subject}"`, err));
}

export class SignupService {
  /**
   * Step one of registering a school from the login page: a visitor gives a school name and an email.
   * Nothing is created yet. We only email a link; the account and the school come into being when the
   * link is opened, which proves the address belongs to them (same idea as Medisetu's sign-up).
   *
   * The answer is the same whether or not the email is already known, so this cannot be used to find
   * out who has an account. (The one exception is a taken school name, which is public information.)
   */
  static async requestSignup(schoolName: string, email: string): Promise<void> {
    if (await Tenant.exists({ nameKey: nameKeyOf(schoolName) })) throw SCHOOL_EXISTS();

    const loginUrl = `${env.clientUrls[0]}/login`;

    // An email that already has an account, or a school in progress, gets a "sign in instead" note.
    const taken =
      (await User.exists({ email })) ||
      (await Tenant.exists({ contactEmail: email, approvalStatus: { $in: ["invited", "onboarding", "pending", "rejected"] } }));
    if (taken) {
      fireAndForget(email, alreadyRegisteredEmail({ loginUrl }));
      return;
    }

    const recent = await AuthToken.exists({
      type: "school_signup",
      email,
      createdAt: { $gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
    });
    if (recent) return;

    // Only the newest link works.
    await AuthToken.deleteMany({ type: "school_signup", email, usedAt: null });

    const rawToken = generateToken();
    await AuthToken.create({
      type: "school_signup",
      tokenHash: hashToken(rawToken),
      email,
      schoolName,
      expiresAt: new Date(Date.now() + env.signupTokenTtlHours * 60 * 60 * 1000),
    });

    const signupUrl = `${env.clientUrls[0]}/accept-invite?token=${rawToken}`;
    fireAndForget(
      email,
      schoolSignupEmail({ schoolName, signupUrl, ttlHours: env.signupTokenTtlHours }),
      `Sign-up link for ${email} (${schoolName}): ${signupUrl}`
    );
  }
}
