import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { env } from "../config/env";
import { userFromToken } from "../middleware/auth";
import { FULL_ACCESS_ROLES } from "../main/permissions/constants";
import { PermissionService } from "../main/permissions/services/permission.service";
import { ApiError } from "../utils/ApiError";
import { logger } from "../utils/logger";

/**
 * The live line to the browser (docs/notifications.md): a Socket.IO server on the API's own port, at /socket.io.
 *
 *  - A socket signs in with the access token in its handshake (`auth: { token }`) and is refused exactly when a request with that token
 *    would be (no token, a bad or old one, a closed account, a suspended or unapproved school); the refusal's message is the error code
 *    (TOKEN_MISSING, TOKEN_INVALID, ACCOUNT_DISABLED, ...), so the app knows to refresh its token and come back.
 *  - Each socket joins its person's own room, `user:<id>`, and nothing else: whatever is sent to a person reaches every tab they have
 *    open, and nobody else's, in any school.
 *  - The server only pushes; the browser never sends anything that is acted on. Everything a push says is also kept in MongoDB and read
 *    with GET /notifications, so a closed tab misses nothing.
 *
 * One API process holds the sockets it accepted. Running more than one (several instances behind a load balancer) needs the Socket.IO
 * Redis adapter so a push reaches sockets held by the other processes too.
 */
let io: Server | null = null;

const roomOf = (userId: string) => `user:${userId}`;
const trackingRoomOf = (tenantId: string) => `tenant:${tenantId}:tracking`;

/**
 * Who may watch the school's vehicles live: whoever may see Transport on the whole school (transport.view: the same rule as
 * requireSchoolPermission; a teacher or a parent only through a staff role), the school admin and the principal always.
 */
async function mayWatchVehicles(user: { userId: string; role: string; tenantId: string | null }): Promise<boolean> {
  if (!user.tenantId) return false;
  if (FULL_ACCESS_ROLES.includes(user.role)) return true;
  return (await PermissionService.accessOf(user)).schoolPermissions.includes("transport.view");
}

export function startRealtime(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: env.clientUrls },
    serveClient: false,
  });

  io.use(async (socket, next) => {
    const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
    try {
      socket.data.user = await userFromToken(typeof token === "string" ? token : null, true);
      next();
    } catch (err) {
      // A refusal says why; anything else (the database away) is UNAVAILABLE, which the app simply tries again later.
      if (err instanceof ApiError) return next(new Error(err.code ?? "UNAUTHORIZED"));
      logger.warn("Socket sign-in failed", { error: err instanceof Error ? err.message : String(err) });
      next(new Error("UNAVAILABLE"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as { userId: string; role: string; tenantId: string | null };
    void socket.join(roomOf(user.userId));
    // The live map: the vehicles' positions go to the people of the SAME school who may see Transport, and to nobody else. The right is
    // read when the socket connects, so a change in Permissions reaches a tab that is already open when it next reconnects.
    mayWatchVehicles(user)
      .then((may) => may && void socket.join(trackingRoomOf(user.tenantId!)))
      .catch((err) => logger.warn("Socket tracking right not read", { error: err instanceof Error ? err.message : String(err) }));
  });

  return io;
}

export async function stopRealtime(): Promise<void> {
  if (!io) return;
  const closing = io;
  io = null;
  await closing.close();
}

/** Sends an event to every open socket of this person. Does nothing when no socket server runs (the tests, a script). */
export function pushTo(userId: string, event: string, payload: unknown): void {
  io?.to(roomOf(userId)).emit(event, payload);
}

/** Sends an event to every open socket of the school's people who may watch the vehicles. Does nothing when no socket server runs. */
export function pushToTracking(tenantId: string, event: string, payload: unknown): void {
  io?.to(trackingRoomOf(tenantId)).emit(event, payload);
}
