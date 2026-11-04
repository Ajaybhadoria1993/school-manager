import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { hashPassword } from "../../../utils/authUtils";
import { isDuplicateKey } from "../../academics/services/shared";
import { TokenService } from "../../auth/services/token.service";
import { User } from "../../users/models/User";
import type { LoginAccountInput } from "../schemas/staff.schemas";
import { suggestUsernames } from "./usernames.service";

/** A teacher's login as the list and the teacher's page show it. The password is never part of it. */
export interface TeacherLoginDto {
  username: string;
  isActive: boolean;
}

/** The details of a teacher that a login repeats (the login's name, phone and email follow the teacher's). */
export interface LoginDetails {
  name?: string;
  phone?: string | null;
  email?: string | null;
}

/** A taken username is said so with free ones like it (meena.singh_41), the same ones Add teacher offers as it is typed. */
async function usernameTaken(username: string, path = "login.username"): Promise<ApiError> {
  const free = await suggestUsernames(username, 2);
  const message = `This username is taken. Try another${free.length > 0 ? `, for example ${free.join(" or ")}` : ""}`;
  return ApiError.conflict(message, "USERNAME_TAKEN", [{ path, message }]);
}

const emailTaken = () => {
  const message = "This email already has a login. Use another email, or leave it empty";
  return ApiError.conflict(message, "LOGIN_EMAIL_TAKEN", [{ path: "email", message }]);
};

/** A duplicate the pre-check could not see (two requests at once), said the same way. */
async function explain(err: unknown, username: string, path?: string): Promise<unknown> {
  if (!isDuplicateKey(err)) return err;
  const pattern = (err as { keyPattern?: Record<string, unknown> }).keyPattern ?? {};
  return "email" in pattern ? emailTaken() : usernameTaken(username, path);
}

/** Who a login is for, and where a refused username is said ("login.username" in Add teacher, "username" in a login of its own). */
export interface LoginOptions {
  role?: "teacher" | "parent";
  path?: string;
}

/**
 * The sign-in account of a teacher (and, since 2026-11-04, of a parent: ParentLoginService): a User with the role "teacher" or
 * "parent", made when the school gives the person a login and kept in step with them after that (name, phone, email, and switched off
 * when a teacher has left). It signs in through the same /auth/login as everyone, with the username, from the web page now and from the
 * mobile app later. Only a hash of the password is kept.
 */
export class TeacherLogin {
  /** The username and the email are nobody else's login (on the whole platform). `except` is the login being changed. */
  static async assertFree(username: string | null, email: string | null, except: Types.ObjectId | null = null, path?: string): Promise<void> {
    const other = except ? { _id: { $ne: except } } : {};
    if (username && (await User.exists({ username, ...other }))) throw await usernameTaken(username, path);
    if (email && (await User.exists({ email, ...other }))) throw emailTaken();
  }

  /** Makes the login and returns its id. */
  static async create(
    tenantId: string,
    person: { name: string; mobile: string | null; email: string | null; isActive: boolean },
    login: LoginAccountInput,
    { role = "teacher", path }: LoginOptions = {}
  ): Promise<Types.ObjectId> {
    const passwordHash = await hashPassword(login.password);
    try {
      const user = await User.create({
        name: person.name,
        username: login.username,
        ...(person.email ? { email: person.email } : {}),
        ...(person.mobile ? { phone: person.mobile } : {}),
        passwordHash,
        role,
        tenantId,
        isActive: person.isActive,
      });
      return user._id;
    } catch (err) {
      throw await explain(err, login.username, path);
    }
  }

  /**
   * Another username for the login (the school changes it; the password and the sessions stay). Someone else's username is refused with
   * free ones; the login's own is no change.
   */
  static async setUsername(userId: Types.ObjectId, username: string): Promise<void> {
    if (await User.exists({ username, _id: { $ne: userId } })) throw await usernameTaken(username, "username");
    try {
      await User.updateOne({ _id: userId }, { $set: { username } });
    } catch (err) {
      if (isDuplicateKey(err)) throw await usernameTaken(username, "username");
      throw err;
    }
  }

  /** Takes the login away again (a teacher that could not be saved after it was made). */
  static async remove(userId: Types.ObjectId): Promise<void> {
    await User.deleteOne({ _id: userId });
  }

  /** The login of each of these users, by id. */
  static async byIds(ids: Types.ObjectId[]): Promise<Map<string, TeacherLoginDto>> {
    if (ids.length === 0) return new Map();
    const users = await User.find({ _id: { $in: ids } }).select("username isActive").lean();
    return new Map(users.filter((u) => u.username).map((u) => [u._id.toString(), { username: u.username as string, isActive: u.isActive }]));
  }

  /** A new password. Every session the teacher has is ended (their refresh tokens go; older access tokens are refused from the next second). */
  static async setPassword(userId: Types.ObjectId, password: string): Promise<void> {
    const passwordHash = await hashPassword(password);
    await User.updateOne({ _id: userId }, { $set: { passwordHash, passwordChangedAt: new Date() } });
    await TokenService.revokeAllForUser(userId);
  }

  /** On when the teacher teaches here, off when they have left. Switching it off ends their sessions. */
  static async setActive(userId: Types.ObjectId | null | undefined, isActive: boolean): Promise<void> {
    if (!userId) return;
    await User.updateOne({ _id: userId }, { $set: { isActive } });
    if (!isActive) await TokenService.revokeAllForUser(userId);
  }

  /** The login repeats the teacher's name, phone and email. An empty email takes the email away: the username still opens it. */
  static async sync(userId: Types.ObjectId, details: LoginDetails): Promise<void> {
    const set: Record<string, unknown> = {};
    const unset: Record<string, ""> = {};
    if (details.name !== undefined) set.name = details.name;
    if (details.phone !== undefined) {
      if (details.phone) set.phone = details.phone;
      else unset.phone = "";
    }
    if (details.email !== undefined) {
      if (details.email) set.email = details.email;
      else unset.email = "";
    }
    const update = { ...(Object.keys(set).length > 0 ? { $set: set } : {}), ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}) };
    if (Object.keys(update).length === 0) return;
    try {
      await User.updateOne({ _id: userId }, update);
    } catch (err) {
      throw await explain(err, "");
    }
  }
}
