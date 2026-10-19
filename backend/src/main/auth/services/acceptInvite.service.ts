import { ApiError } from "../../../utils/ApiError";
import { hashPassword, hashToken } from "../../../utils/authUtils";
import { Tenant, type ITenant } from "../../tenants/models/Tenant";
import { createTenant } from "../../tenants/services/tenantFactory";
import { User } from "../../users/models/User";
import { AuthToken, type IAuthToken } from "../models/AuthToken";
import { buildSession, type SessionPayload } from "./auth.service";
import type { SessionMeta } from "./token.service";

const LINK_INVALID = () =>
  ApiError.badRequest("This link is invalid. Ask for a new one.", "INVITE_INVALID");
const LINK_EXPIRED = () =>
  ApiError.badRequest("This link has expired. Ask for a new one.", "INVITE_EXPIRED");
const ALREADY_REGISTERED = () =>
  ApiError.conflict("This link was already used. Sign in with your email and password.", "ALREADY_REGISTERED");

/** Both ways in lead here: the super admin's invitation, and a school registering itself from the login page. */
const LINK_TYPES = ["school_invite", "school_signup"] as const;

export type LinkKind = "invite" | "signup";

export interface InviteInfo {
  email: string;
  schoolName: string;
  expiresAt: string;
  kind: LinkKind;
}

interface LoadedLink {
  token: IAuthToken;
  kind: LinkKind;
  /** Set for invitations (the school already exists); absent for self sign-up. */
  tenant: ITenant | null;
}

export class AcceptInviteService {
  /**
   * Looks the link up and decides whether it can still be used, without consuming it.
   * Unknown links all give the same answer, so the endpoint reveals nothing about real schools.
   */
  private static async load(rawToken: string): Promise<LoadedLink> {
    const token = await AuthToken.findOne({ tokenHash: hashToken(rawToken), type: { $in: LINK_TYPES } }).lean();
    if (!token || !token.email) throw LINK_INVALID();
    const kind: LinkKind = token.type === "school_signup" ? "signup" : "invite";

    if (token.usedAt) {
      throw (await User.exists({ email: token.email })) ? ALREADY_REGISTERED() : LINK_INVALID();
    }
    if (token.expiresAt.getTime() <= Date.now()) throw LINK_EXPIRED();
    if (await User.exists({ email: token.email })) throw ALREADY_REGISTERED();

    if (kind === "invite") {
      const tenant = token.tenantId ? await Tenant.findById(token.tenantId).lean() : null;
      if (!tenant || tenant.approvalStatus !== "invited") throw LINK_INVALID();
      return { token, kind, tenant };
    }

    if (!token.schoolName) throw LINK_INVALID();
    return { token, kind, tenant: null };
  }

  static async validate(rawToken: string): Promise<InviteInfo> {
    const { token, kind, tenant } = await AcceptInviteService.load(rawToken);
    return {
      email: token.email!,
      schoolName: tenant?.name ?? token.schoolName!,
      expiresAt: token.expiresAt.toISOString(),
      kind,
    };
  }

  /** Turns the link into the school admin's account (and, for a sign-up, the school) and signs them in. */
  static async accept(rawToken: string, name: string, password: string, meta: SessionMeta): Promise<SessionPayload> {
    const { token, kind, tenant: invited } = await AcceptInviteService.load(rawToken);

    // Claim the link in one atomic step: of two simultaneous requests, only one gets past here.
    const claimed = await AuthToken.findOneAndUpdate(
      { _id: token._id, usedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } }
    );
    if (!claimed) throw LINK_INVALID();

    // MongoDB has no multi-document transaction here, so if a later step fails we undo by hand.
    let createdUserId: unknown = null;
    let createdTenantId: unknown = null;
    try {
      let tenant: ITenant;
      if (kind === "signup") {
        // The school did not exist until this moment. Registering it only now means an address nobody
        // confirmed never leaves a school behind.
        const openElsewhere = await Tenant.exists({
          contactEmail: token.email,
          approvalStatus: { $in: ["invited", "onboarding", "pending", "rejected"] },
        });
        if (openElsewhere) throw ALREADY_REGISTERED();
        tenant = await createTenant({
          name: token.schoolName!,
          contactEmail: token.email!,
          approvalStatus: "onboarding",
          source: "signup",
        });
        createdTenantId = tenant._id;
      } else {
        tenant = invited as ITenant;
      }

      const user = await User.create({
        name,
        email: token.email,
        passwordHash: await hashPassword(password),
        role: "school_admin",
        tenantId: tenant._id,
        isActive: true,
        // They received the email and opened the link, which proves they own the address.
        emailVerifiedAt: new Date(),
      });
      createdUserId = user._id;

      if (kind === "invite") {
        const moved = await Tenant.updateOne(
          { _id: tenant._id, approvalStatus: "invited" },
          { $set: { approvalStatus: "onboarding" } }
        );
        if (moved.modifiedCount !== 1) throw LINK_INVALID();
      }

      return await buildSession(user, meta);
    } catch (err) {
      if (createdUserId) await User.deleteOne({ _id: createdUserId });
      if (createdTenantId) await Tenant.deleteOne({ _id: createdTenantId });
      await AuthToken.updateOne({ _id: token._id }, { $unset: { usedAt: 1 } }); // give the link back
      if ((err as { code?: number }).code === 11000) throw ALREADY_REGISTERED();
      throw err;
    }
  }
}
