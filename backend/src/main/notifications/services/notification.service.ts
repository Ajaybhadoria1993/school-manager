import { Types } from "mongoose";
import { pushTo } from "../../../realtime/socket";
import { ApiError } from "../../../utils/ApiError";
import { reportError } from "../../../utils/logger";
import { Tenant } from "../../tenants/models/Tenant";
import { recordsOfSchool } from "../../tenants/services/schoolSides";
import { User } from "../../users/models/User";
import { Notification, type INotification, type NotificationKind } from "../models/Notification";

// The people who run the school (RUNNER_ROLES of classroom/services/access.ts, kept here so this file imports no service).
const RUNNER_ROLES: readonly string[] = ["school_admin", "principal"];

/** One kind of line for a group of people: the same words for each of them. */
export interface Message {
  /** These people (user ids), or "admins": the people who run the school (school admins and principals). */
  to: string[] | "admins";
  kind: NotificationKind;
  title: string;
  body?: string | null;
  link?: string | null;
  childId?: string | null;
}

export interface NotificationDto {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  childId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface BellQuery {
  before?: string;
  limit: number;
}

const toDto = (n: Pick<INotification, "_id" | "kind" | "title" | "body" | "link" | "childId" | "readAt" | "createdAt">): NotificationDto => ({
  id: n._id.toString(),
  kind: n.kind,
  title: n.title,
  body: n.body ?? null,
  link: n.link ?? null,
  childId: n.childId ? n.childId.toString() : null,
  readAt: n.readAt ? n.readAt.toISOString() : null,
  createdAt: n.createdAt.toISOString(),
});

const clip = (text: string | null | undefined, max: number) => (text ? (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text) : null);

/** Sends still being worked out after their request was answered (so a test, or a shutdown, can wait for them). */
const pending = new Set<Promise<void>>();

/**
 * The bell (docs/notifications.md): lines made for one person each, kept in MongoDB, and pushed to that person's open tabs as they are
 * made (src/realtime/socket.ts).
 */
export class NotificationService {
  /**
   * Works out the messages and sends them once the action's answer is on its way, so a class of forty parents does not slow a teacher's
   * Save down, and a failure here never undoes or fails the action itself (it is logged). `actorId` (who did it) is left out of every
   * message: nobody is told of what they did themselves.
   */
  static later(tenantId: string, actorId: string | null, build: () => Promise<Message[]>): void {
    const run = (async () => {
      try {
        await NotificationService.send(tenantId, actorId, await build());
      } catch (err) {
        reportError(err, { source: "notifications", tenantId });
      }
    })();
    pending.add(run);
    void run.finally(() => pending.delete(run));
  }

  /** Resolves once every send under way has finished. */
  static async idle(): Promise<void> {
    while (pending.size > 0) await Promise.allSettled([...pending]);
  }

  /**
   * One line per person: a person named by several messages gets the first (put the most particular message first, the one for the
   * school last), only people of this school whose login is open are told, and never the one who did it.
   */
  static async send(tenantId: string, actorId: string | null, messages: Message[]): Promise<void> {
    if (messages.length === 0) return;
    const school = new Types.ObjectId(tenantId);
    const needsAdmins = messages.some((m) => m.to === "admins");
    const named = [...new Set(messages.flatMap((m) => (m.to === "admins" ? [] : m.to)))].filter((id) => Types.ObjectId.isValid(id));
    // A medium run as its own side has no administrator of its own: the school's administrator, who signs in at the school, hears about it.
    const parent = needsAdmins ? (await Tenant.findById(school).select("parentTenantId").lean())?.parentTenantId : null;
    const runners = [{ tenantId: school, role: { $in: RUNNER_ROLES } }, ...(parent ? [{ tenantId: parent, role: "school_admin" }] : [])];
    const [admins, open] = await Promise.all([
      needsAdmins ? User.find({ $or: runners, isActive: true }).select("_id").lean() : Promise.resolve([]),
      // A teacher who also works on this medium may have their login on another one of the school.
      named.length > 0 ? User.find({ tenantId: { $in: await recordsOfSchool(school) }, _id: { $in: named.map((id) => new Types.ObjectId(id)) }, isActive: true }).select("_id").lean() : Promise.resolve([]),
    ]);
    const adminIds = admins.map((u) => u._id.toString());
    const isOpen = new Set([...adminIds, ...open.map((u) => u._id.toString())]);

    const told = new Set<string>(actorId ? [actorId] : []);
    const docs: Omit<INotification, "_id" | "createdAt" | "readAt">[] = [];
    for (const m of messages) {
      for (const userId of m.to === "admins" ? adminIds : m.to) {
        if (told.has(userId) || !isOpen.has(userId)) continue;
        told.add(userId);
        docs.push({
          tenantId: school,
          userId: new Types.ObjectId(userId),
          kind: m.kind,
          title: clip(m.title, 200) ?? "",
          body: clip(m.body, 500),
          link: m.link ?? null,
          childId: m.childId ? new Types.ObjectId(m.childId) : null,
        });
      }
    }
    if (docs.length === 0) return;
    const made = await Notification.insertMany(docs);
    for (const n of made) pushTo(n.userId.toString(), "notification", toDto(n.toObject()));
  }

  /** A person's bell: newest first, `limit` at a time (`before` = the last id of the page above), with how many are unread. */
  static async list(tenantId: string, userId: string, query: BellQuery): Promise<{ items: NotificationDto[]; unread: number; hasMore: boolean }> {
    const mine = { tenantId: new Types.ObjectId(tenantId), userId: new Types.ObjectId(userId) };
    const filter = query.before ? { ...mine, _id: { $lt: new Types.ObjectId(query.before) } } : mine;
    const [rows, unread] = await Promise.all([
      Notification.find(filter).sort({ _id: -1 }).limit(query.limit + 1).lean(),
      Notification.countDocuments({ ...mine, readAt: null }),
    ]);
    return { items: rows.slice(0, query.limit).map(toDto), unread, hasMore: rows.length > query.limit };
  }

  /** Marks one of the person's own as read (another person's is "not found"); every tab of theirs hears the new count. */
  static async read(tenantId: string, userId: string, id: string): Promise<{ unread: number }> {
    const mine = { tenantId: new Types.ObjectId(tenantId), userId: new Types.ObjectId(userId) };
    const found = await Notification.findOneAndUpdate({ ...mine, _id: new Types.ObjectId(id) }, [{ $set: { readAt: { $ifNull: ["$readAt", "$$NOW"] } } }], { new: true }).lean();
    if (!found) throw ApiError.notFound("Notification not found", "NOTIFICATION_NOT_FOUND");
    return NotificationService.tellCount(tenantId, userId, id);
  }

  static async readAll(tenantId: string, userId: string): Promise<{ unread: number }> {
    const mine = { tenantId: new Types.ObjectId(tenantId), userId: new Types.ObjectId(userId) };
    await Notification.updateMany({ ...mine, readAt: null }, { $set: { readAt: new Date() } });
    return NotificationService.tellCount(tenantId, userId);
  }

  /** The new count to every tab of the person (with the one just read, so those tabs show it read too). */
  private static async tellCount(tenantId: string, userId: string, readId?: string): Promise<{ unread: number }> {
    const unread = await Notification.countDocuments({ tenantId: new Types.ObjectId(tenantId), userId: new Types.ObjectId(userId), readAt: null });
    pushTo(userId, "notifications:unread", readId ? { unread, id: readId } : { unread });
    return { unread };
  }
}
