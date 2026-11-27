import { Types } from "mongoose";
import { env, isEmailConfigured } from "../../../config/env";
import { ApiError } from "../../../utils/ApiError";
import { generateToken, hashPassword, hashToken } from "../../../utils/authUtils";
import { sendEmail } from "../../../utils/email";
import { logger } from "../../../utils/logger";
import { loginInviteEmail } from "../../../templates/loginInvite";
import { Tenant } from "../../tenants/models/Tenant";
import { User } from "../../users/models/User";
import { AuthToken } from "../models/AuthToken";
import { assertTenantActive, buildSession, type SessionPayload } from "./auth.service";
import { TokenService, type SessionMeta } from "./token.service";

const LINK_INVALID = () => ApiError.badRequest("This link is invalid. Ask your school to send it again.", "INVITE_INVALID");
const LINK_EXPIRED = () => ApiError.badRequest("This link has expired. Ask your school to send it again.", "INVITE_EXPIRED");
const ALREADY_USED = () => ApiError.conflict("This link was already used. Sign in with your email and password.", "ALREADY_REGISTERED");

/** What the school is told after an invitation: until when it works, and whether the email went out. */
export interface LoginInviteDelivery {
  email: string;
  inviteExpiresAt: string;
  /** False when the email could not be handed to the mail server: the school should send it again. */
  emailSent: boolean;
  /** Development convenience only: present when no email service is configured AND the server is not in production. */
  devInviteLink?: string;
}

/** What the "Set your password" page shows before the password is chosen. */
export interface LoginInviteInfo {
  name: string;
  email: string;
  schoolName: string;
  expiresAt: string;
}

const inviteUrl = (rawToken: string) => `${env.clientUrls[0]}/set-password?token=${rawToken}`;

/**
 * The email login of a teacher or a staff member (2026-11-26, the user: no username and password made by the school; the school gives the
 * login, an invitation goes to their email, the login is Pending until they open it and choose a password, then they sign in with that email
 * and password and can use Forgot password like the school admin). The login (a User with `invitePending`) is made by TeacherLogin; this
 * sends the link, checks it, and turns it into the password. The same link also lets a person whose login already works choose a new password.
 */
export class LoginInviteService {
  /** A fresh link for this login, emailed. The previous link stops working. */
  static async send(userId: Types.ObjectId): Promise<LoginInviteDelivery> {
    const user = await User.findById(userId).select("name email tenantId").lean();
    if (!user || !user.email) throw ApiError.badRequest("This login has no email to send the invitation to.", "LOGIN_HAS_NO_EMAIL");
    const school = user.tenantId ? await Tenant.findById(user.tenantId).select("name").lean() : null;

    await AuthToken.deleteMany({ userId: user._id, type: "login_invite", usedAt: null });
    const rawToken = generateToken();
    const expiresAt = new Date(Date.now() + env.inviteTokenTtlHours * 60 * 60 * 1000);
    await AuthToken.create({ type: "login_invite", tokenHash: hashToken(rawToken), userId: user._id, tenantId: user.tenantId ?? undefined, email: user.email, expiresAt });

    const url = inviteUrl(rawToken);
    const mail = loginInviteEmail({ name: user.name, schoolName: school?.name ?? "Your school", email: user.email, inviteUrl: url, ttlHours: env.inviteTokenTtlHours });
    let emailSent = true;
    try {
      emailSent = (await sendEmail({ to: user.email, ...mail, devPreview: `Login invitation for ${user.email}: ${url}` })).delivered;
    } catch (err) {
      logger.error("Failed to send a login invitation email", err);
      emailSent = false;
    }
    return {
      email: user.email,
      inviteExpiresAt: expiresAt.toISOString(),
      emailSent,
      ...(!isEmailConfigured && !env.isProduction ? { devInviteLink: url } : {}),
    };
  }

  /** The links of this login stop working (its email changed, so a link sent to the old address must not open it). */
  static async cancel(userId: Types.ObjectId): Promise<void> {
    await AuthToken.deleteMany({ userId, type: { $in: ["login_invite", "password_reset"] }, usedAt: null });
  }

  /** The link, its person and whether it can still be used, without using it. Unknown links all give the same answer. */
  private static async load(rawToken: string) {
    const token = await AuthToken.findOne({ tokenHash: hashToken(rawToken), type: "login_invite" }).lean();
    if (!token || !token.userId) throw LINK_INVALID();
    const user = await User.findById(token.userId).select("name email tenantId isActive invitePending").lean();
    if (!user || !user.isActive || !user.email || user.email !== token.email) throw LINK_INVALID();
    if (token.usedAt) throw user.invitePending ? LINK_INVALID() : ALREADY_USED();
    if (token.expiresAt.getTime() <= Date.now()) throw LINK_EXPIRED();
    return { token, user };
  }

  static async check(rawToken: string): Promise<LoginInviteInfo> {
    const { token, user } = await LoginInviteService.load(rawToken);
    const school = user.tenantId ? await Tenant.findById(user.tenantId).select("name").lean() : null;
    return { name: user.name, email: user.email!, schoolName: school?.name ?? "", expiresAt: token.expiresAt.toISOString() };
  }

  /** The password from the link: the login is no longer pending, the email is confirmed, and this device is signed in. */
  static async accept(rawToken: string, password: string, meta: SessionMeta): Promise<SessionPayload> {
    const { token } = await LoginInviteService.load(rawToken);
    // Claim the link in one atomic step: of two simultaneous requests, only one gets past here.
    const claimed = await AuthToken.findOneAndUpdate({ _id: token._id, usedAt: null, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } });
    if (!claimed) throw LINK_INVALID();

    const now = new Date();
    const user = await User.findOneAndUpdate(
      { _id: token.userId, isActive: true, email: token.email },
      { $set: { passwordHash: await hashPassword(password), passwordChangedAt: now, emailVerifiedAt: now }, $unset: { invitePending: 1 } },
      { new: true }
    );
    if (!user) throw LINK_INVALID();
    // Any other link of theirs (an older reset) stops working, and a session made with an older password ends.
    await AuthToken.deleteMany({ userId: user._id, type: { $in: ["login_invite", "password_reset"] }, usedAt: null });
    await TokenService.revokeAllForUser(user._id);
    // The password is set either way, but a suspended school gets no session (same as sign-in).
    await assertTenantActive(user.tenantId);
    return buildSession(user, meta);
  }
}
