import { ApiError } from "../../../utils/ApiError";
import { env } from "../../../config/env";
import { generateToken, hashPassword, hashToken } from "../../../utils/authUtils";
import { sendEmail } from "../../../utils/email";
import { logger } from "../../../utils/logger";
import { passwordResetEmail } from "../../../templates/passwordReset";
import { User } from "../../users/models/User";
import { AuthToken } from "../models/AuthToken";
import { assertTenantActive, buildSession, type SessionPayload } from "./auth.service";
import { TokenService, type SessionMeta } from "./token.service";

const RESET_INVALID = () =>
  ApiError.badRequest("This reset link is invalid or has expired. Please request a new one.", "RESET_INVALID");

/** Asking again within this window sends nothing: stops the form being used to flood an inbox. */
const RESEND_COOLDOWN_MS = 60 * 1000;

const inFlight = new Set<Promise<void>>();

export class PasswordService {
  /**
   * Starts a reset without making the caller wait for it. The work (a lookup, token, email) is only
   * done for real accounts, so doing it before answering would make the response time reveal who is
   * registered; answering first makes every email take the same time.
   */
  static queueReset(email: string): void {
    const job: Promise<void> = PasswordService.requestReset(email)
      .catch((err) => logger.error("Failed to start a password reset", err))
      .finally(() => inFlight.delete(job));
    inFlight.add(job);
  }

  /** Resolves once every reset started by queueReset has finished (tests wait on this). */
  static async idle(): Promise<void> {
    await Promise.all([...inFlight]);
  }

  static async requestReset(email: string): Promise<void> {
    const user = await User.findOne({ email, isActive: true });
    if (!user) return;

    const recent = await AuthToken.exists({
      type: "password_reset",
      userId: user._id,
      usedAt: null,
      createdAt: { $gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
    });
    if (recent) return;

    // Only the newest link works.
    await AuthToken.deleteMany({ userId: user._id, type: "password_reset" });

    const rawToken = generateToken();
    await AuthToken.create({
      type: "password_reset",
      tokenHash: hashToken(rawToken),
      userId: user._id,
      email: user.email,
      expiresAt: new Date(Date.now() + env.passwordResetTtlMinutes * 60 * 1000),
    });

    const resetUrl = `${env.clientUrls[0]}/reset-password?token=${rawToken}`;
    const mail = passwordResetEmail({ name: user.name, resetUrl, ttlMinutes: env.passwordResetTtlMinutes });

    sendEmail({ to: user.email, ...mail, devPreview: `Password reset link for ${user.email}: ${resetUrl}` }).catch(
      (err) => logger.error("Failed to send password reset email", err)
    );
  }

  static async resetPassword(token: string, newPassword: string, meta: SessionMeta): Promise<SessionPayload> {
    // Claim the token in one atomic step so two simultaneous requests can never both use it.
    const claimed = await AuthToken.findOneAndUpdate(
      { tokenHash: hashToken(token), type: "password_reset", usedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } }
    );
    if (!claimed || !claimed.userId) throw RESET_INVALID();

    const user = await User.findOne({ _id: claimed.userId, isActive: true });
    if (!user) throw RESET_INVALID();

    user.passwordHash = await hashPassword(newPassword);
    user.passwordChangedAt = new Date();
    await user.save();

    // Every existing session dies: refresh tokens are deleted, and access tokens issued
    // before passwordChangedAt are rejected by requireAuth.
    await TokenService.revokeAllForUser(user._id);

    // The password is changed either way, but a suspended school gets no session (same as sign-in).
    await assertTenantActive(user.tenantId);

    // This device continues signed in.
    return buildSession(user, meta);
  }
}
