import { io } from "socket.io-client";
import { API_URL, refreshRejectedToken } from "../redux/api/baseQueryWithReauth";
import { getToken } from "../utils/auth";
import type { NotificationItem } from "../types";

/** The socket server is the API's own: its origin in production, this page's in development (Vite forwards /socket.io). */
const SOCKET_ORIGIN = /^https?:\/\//i.test(API_URL) ? new URL(API_URL).origin : undefined;

/** Waits before trying again after the server could not take the socket (it was down, or busy). */
const RETRY_MS = [2_000, 5_000, 15_000, 30_000];

export interface NotificationHandlers {
  onNotification: (item: NotificationItem) => void;
  /** The unread count changed elsewhere (another tab read one, `readId`, or all of them). */
  onUnread: (unread: number, readId?: string) => void;
  /** The line is back after a break: whatever came meanwhile is read again. */
  onReconnect: () => void;
}

/**
 * The live line for the signed-in person's notifications (docs/notifications.md; the server is backend/src/realtime/socket.ts). It signs
 * in with the current access token on every (re)connection; when the server says the token is old it gets a new one, the way a request
 * does, and connects again. A closed account or a suspended school is not retried: the app signs out on its next request. Returns the
 * function that closes it.
 */
export function connectNotifications(handlers: NotificationHandlers): () => void {
  const socket = io(SOCKET_ORIGIN, {
    path: "/socket.io",
    autoConnect: false,
    auth: (cb) => cb({ token: getToken() ?? "" }),
  });
  let stopped = false;
  let connectedBefore = false;
  let retries = 0;
  let refreshes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const retryLater = () => {
    clearTimeout(timer);
    timer = setTimeout(() => !stopped && socket.connect(), RETRY_MS[Math.min(retries++, RETRY_MS.length - 1)]);
  };

  socket.on("connect", () => {
    retries = 0;
    refreshes = 0;
    if (connectedBefore) handlers.onReconnect();
    connectedBefore = true;
  });
  socket.on("notification", (item: NotificationItem) => handlers.onNotification(item));
  socket.on("notifications:unread", (p: { unread: number; id?: string }) => handlers.onUnread(p.unread, p.id));
  socket.on("connect_error", (err: Error) => {
    if (stopped) return;
    const code = err.message;
    if (code === "TOKEN_INVALID" || code === "TOKEN_MISSING") {
      // Twice refreshed and still refused: something else is wrong, leave it to the next request.
      if (++refreshes > 2) return;
      void refreshRejectedToken().then((outcome) => {
        if (stopped) return;
        if (outcome === "ok") socket.connect();
        else if (outcome === "transient") retryLater();
      });
    } else if (code === "ACCOUNT_DISABLED" || code.startsWith("TENANT_")) {
      return;
    } else if (!socket.active) {
      // Refused for another reason (UNAVAILABLE): Socket.IO does not try again on its own after a refusal.
      retryLater();
    }
  });

  socket.connect();
  return () => {
    stopped = true;
    clearTimeout(timer);
    socket.removeAllListeners();
    socket.disconnect();
  };
}
