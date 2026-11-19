import { io } from "socket.io-client";
import { API_URL, refreshRejectedToken } from "../redux/api/baseQueryWithReauth";
import { getToken } from "../utils/auth";
import type { PositionPush } from "../types";

/** The socket server is the API's own: its origin in production, this page's in development (Vite forwards /socket.io). */
const SOCKET_ORIGIN = /^https?:\/\//i.test(API_URL) ? new URL(API_URL).origin : undefined;

/** Waits before trying again after the server could not take the socket (it was down, or busy). */
const RETRY_MS = [2_000, 5_000, 15_000, 30_000];

export interface TrackingHandlers {
  /** A vehicle reported (or its trip ended): where it is now. */
  onPosition: (push: PositionPush) => void;
  /** The line opened or closed: the page says "Live" or "Reconnecting". */
  onLine: (open: boolean) => void;
  /** The line is back after a break: whatever came meanwhile is read again. */
  onReconnect: () => void;
}

/**
 * The live line of the map (the server is backend/src/realtime/socket.ts): every position of the school's vehicles arrives as `vehicle:position`.
 * It signs in the way the notification socket does (the access token on every connection, a new one when the server says the token is old) and
 * is only given the school's vehicles when the person may see Transport. Returns the function that closes it.
 */
export function connectTracking(handlers: TrackingHandlers): () => void {
  const socket = io(SOCKET_ORIGIN, { path: "/socket.io", autoConnect: false, auth: (cb) => cb({ token: getToken() ?? "" }) });
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
    handlers.onLine(true);
    if (connectedBefore) handlers.onReconnect();
    connectedBefore = true;
  });
  socket.on("disconnect", () => !stopped && handlers.onLine(false));
  socket.on("vehicle:position", (push: PositionPush) => handlers.onPosition(push));
  socket.on("connect_error", (err: Error) => {
    if (stopped) return;
    handlers.onLine(false);
    const code = err.message;
    if (code === "TOKEN_INVALID" || code === "TOKEN_MISSING") {
      if (++refreshes > 2) return;
      void refreshRejectedToken().then((outcome) => {
        if (stopped) return;
        if (outcome === "ok") socket.connect();
        else if (outcome === "transient") retryLater();
      });
    } else if (code === "ACCOUNT_DISABLED" || code.startsWith("TENANT_")) {
      return;
    } else if (!socket.active) {
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
