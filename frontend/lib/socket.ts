"use client";

import { io, Socket } from "socket.io-client";
import { getToken } from "./api";

const SOCKET_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api").replace(/\/api\/?$/, "");

let socket: Socket | null = null;

/** One shared connection per browser tab, authenticated with the same JWT as REST calls. */
export function getSocket(): Socket | null {
  const token = getToken();
  if (!token) return null;

  if (!socket) {
    socket = io(SOCKET_URL, { auth: { token }, autoConnect: true });
  } else if (socket.auth && (socket.auth as { token?: string }).token !== token) {
    socket.auth = { token };
    socket.disconnect().connect();
  } else if (!socket.connected) {
    socket.connect();
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
