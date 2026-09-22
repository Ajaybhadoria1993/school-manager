import type { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { verifyToken } from "../utils/jwt";
import { Conversation } from "../models/Message";
import { assertConversationParticipant } from "../utils/conversationAccess";
import { env } from "../config/env";

let io: SocketIOServer | null = null;

function conversationRoom(conversationId: string) {
  return `conversation:${conversationId}`;
}

/**
 * Realtime layer for the Communication Hub's parent-teacher chat. Rooms are
 * per-conversation (not per-user), so both the active chat view and the
 * conversation list can subscribe the same way — a client joins the room for
 * every conversation it's a participant in, and `sendMessage` (REST) emits
 * into that room after persisting. Socket.io is transport only; MongoDB via
 * the REST endpoint remains the single source of truth for message history.
 */
export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: env.clientUrl, credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Authentication token missing"));
    try {
      const payload = verifyToken(token);
      socket.data.userId = payload.userId;
      socket.data.role = payload.role;
      next();
    } catch {
      next(new Error("Invalid or expired session"));
    }
  });

  io.on("connection", (socket: Socket) => {
    socket.on("conversation:join", async (conversationId: string) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return;
        await assertConversationParticipant(socket.data.userId, socket.data.role, conversation);
        socket.join(conversationRoom(conversationId));
      } catch {
        // Silently ignore — client simply won't receive events for a
        // conversation it isn't allowed to join.
      }
    });

    socket.on("conversation:leave", (conversationId: string) => {
      socket.leave(conversationRoom(conversationId));
    });
  });

  return io;
}

export function emitToConversation(conversationId: string, event: string, payload: unknown): void {
  io?.to(conversationRoom(conversationId)).emit(event, payload);
}
