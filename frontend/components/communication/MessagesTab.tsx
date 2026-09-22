"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Plus, MessageSquare, Radio } from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast-context";
import { getSocket } from "@/lib/socket";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select, Input, FormField } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { cn, formatDate, initials } from "@/lib/utils";
import type { ApiResponse, Conversation, Guardian, Message, Staff, Student } from "@/types";

interface NewMessageEvent {
  conversationId: string;
  message: Message;
}

export function MessagesTab() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  async function loadConversations() {
    const res = await api.get<ApiResponse<Conversation[]>>("/communication/conversations");
    setConversations(res.data);
    setActiveId((current) => current ?? res.data[0]?._id ?? null);
    return res.data;
  }

  useEffect(() => {
    loadConversations().then((list) => {
      const socket = getSocket();
      for (const c of list) socket?.emit("conversation:join", c._id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function onNewMessage({ conversationId }: NewMessageEvent) {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c._id === conversationId);
        if (idx === -1) return prev;
        const updated = { ...prev[idx], lastMessageAt: new Date().toISOString() };
        const next = [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
        return next;
      });
    }

    socket.on("message:new", onNewMessage);
    return () => {
      socket.off("message:new", onNewMessage);
    };
  }, []);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="p-0 lg:col-span-1">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            Conversations
            <span title="Live">
              <Radio className="size-3 text-success" />
            </span>
          </p>
          {user?.role === "parent" && (
            <Button size="sm" variant="ghost" onClick={() => setNewOpen(true)}>
              <Plus className="size-4" />
            </Button>
          )}
        </div>
        <div className="max-h-[560px] overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="p-4 text-sm text-foreground-muted">No conversations yet.</p>
          ) : (
            conversations.map((c) => {
              const student = c.studentId as Student;
              const other = user?.role === "parent" ? (c.teacherStaffId as Staff)?.name : (c.guardianId as Guardian)?.name;
              return (
                <button
                  key={c._id}
                  onClick={() => setActiveId(c._id)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 border-b border-border px-4 py-3 text-left hover:bg-surface-muted",
                    activeId === c._id && "bg-primary-soft"
                  )}
                >
                  <span className="text-sm font-medium text-foreground">{other}</span>
                  <span className="text-xs text-foreground-muted">
                    Re: {student?.firstName} &middot; {c.subject}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </Card>

      <div className="lg:col-span-2">
        {activeId ? (
          <ChatPanel conversationId={activeId} />
        ) : (
          <Card className="flex h-96 flex-col items-center justify-center gap-2 text-center">
            <MessageSquare className="size-8 text-foreground-muted" />
            <p className="text-sm text-foreground-muted">Select a conversation to view messages.</p>
          </Card>
        )}
      </div>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Message a Teacher">
        <NewConversationForm
          onCreated={(id) => {
            setNewOpen(false);
            loadConversations().then((list) => {
              const socket = getSocket();
              for (const c of list) socket?.emit("conversation:join", c._id);
            });
            setActiveId(id);
          }}
        />
      </Modal>
    </div>
  );
}

function ChatPanel({ conversationId }: { conversationId: string }) {
  const { user } = useAuth();
  const { push } = useToast();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  useEffect(() => {
    api
      .get<ApiResponse<{ conversation: Conversation; messages: Message[] }>>(`/communication/conversations/${conversationId}/messages`)
      .then((res) => {
        setConversation(res.data.conversation);
        setMessages(res.data.messages);
        scrollToBottom();
      });

    const socket = getSocket();
    socket?.emit("conversation:join", conversationId);

    function onNewMessage(evt: NewMessageEvent) {
      if (evt.conversationId !== conversationId) return;
      setMessages((prev) => (prev.some((m) => m._id === evt.message._id) ? prev : [...prev, evt.message]));
      scrollToBottom();
    }

    socket?.on("message:new", onNewMessage);
    return () => {
      socket?.off("message:new", onNewMessage);
    };
  }, [conversationId]);

  async function send() {
    if (!body.trim()) return;
    setSending(true);
    try {
      await api.post(`/communication/conversations/${conversationId}/messages`, { body });
      setBody("");
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="flex h-[560px] flex-col p-0">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground">{conversation?.subject}</p>
        <p className="text-xs text-foreground-muted">
          Regarding {(conversation?.studentId as Student)?.firstName} {(conversation?.studentId as Student)?.lastName}
        </p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => {
          const senderName = typeof m.senderUserId === "string" ? "" : m.senderUserId.name;
          const isMine = typeof m.senderUserId !== "string" && m.senderRole === user?.role;
          return (
            <div key={m._id} className={cn("flex gap-2", isMine ? "flex-row-reverse" : "flex-row")}>
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[10px] font-semibold text-foreground-muted">
                {initials(senderName || m.senderRole)}
              </div>
              <div className={cn("max-w-[75%] rounded-xl px-3 py-2 text-sm", isMine ? "bg-primary text-white" : "bg-surface-muted text-foreground")}>
                <p>{m.body}</p>
                <p className={cn("mt-1 text-[10px]", isMine ? "text-white/70" : "text-foreground-muted")}>{formatDate(m.createdAt)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <div className="flex items-center gap-2 border-t border-border p-3">
        <Input
          placeholder="Type a message…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <Button size="sm" loading={sending} onClick={send}>
          <Send className="size-4" />
        </Button>
      </div>
    </Card>
  );
}

function NewConversationForm({ onCreated }: { onCreated: (conversationId: string) => void }) {
  const { push } = useToast();
  const [children, setChildren] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Staff[]>([]);
  const [studentId, setStudentId] = useState("");
  const [teacherStaffId, setTeacherStaffId] = useState("");
  const [subject, setSubject] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<ApiResponse<Student[]>>("/students/my-children").then((res) => {
      setChildren(res.data);
      setStudentId(res.data[0]?._id ?? "");
    });
    api.get<ApiResponse<Staff[]>>("/staff", { category: "teaching" }).then((res) => setTeachers(res.data));
  }, []);

  async function submit() {
    setSaving(true);
    try {
      const res = await api.post<ApiResponse<Conversation>>("/communication/conversations", {
        studentId,
        teacherStaffId,
        subject,
      });
      push("success", "Conversation started");
      onCreated(res.data._id);
    } catch (err) {
      push("error", err instanceof ApiRequestError ? err.message : "Failed to start conversation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <FormField label="Regarding">
        <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          {children.map((c) => (
            <option key={c._id} value={c._id}>
              {c.firstName} {c.lastName}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Teacher">
        <Select value={teacherStaffId} onChange={(e) => setTeacherStaffId(e.target.value)}>
          <option value="">Select teacher</option>
          {teachers.map((t) => (
            <option key={t._id} value={t._id}>
              {t.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField label="Subject">
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What's this about?" />
      </FormField>
      <Button className="w-full" disabled={!studentId || !teacherStaffId || !subject} loading={saving} onClick={submit}>
        Start Conversation
      </Button>
    </div>
  );
}
