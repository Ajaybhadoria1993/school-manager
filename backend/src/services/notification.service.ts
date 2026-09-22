/**
 * Omnichannel notification dispatch (FR-7.3): WhatsApp -> SMS fallback -> logged.
 * No live WHATSAPP_API_KEY/SMS_API_KEY configured yet, so this adapter logs
 * the message and records it as "sent" so the rest of the system (delivery
 * flags, read receipts) can be built against a stable interface. Swap the
 * body of `dispatch()` for a real WhatsApp Business API / DLT SMS call later.
 */

export type NotificationChannel = "whatsapp" | "sms" | "push" | "email";

export interface NotificationPayload {
  to: string; // phone or email
  channel: NotificationChannel;
  templateKey: string;
  message: string;
}

export interface NotificationResult {
  channel: NotificationChannel;
  status: "sent" | "failed";
  sentAt: Date;
}

export async function dispatchNotification(payload: NotificationPayload): Promise<NotificationResult> {
  // eslint-disable-next-line no-console
  console.log(`[notify:${payload.channel}] -> ${payload.to} :: ${payload.templateKey} :: ${payload.message}`);
  return { channel: payload.channel, status: "sent", sentAt: new Date() };
}

export async function notifyWithFallback(
  to: string,
  templateKey: string,
  message: string
): Promise<NotificationResult> {
  const whatsapp = await dispatchNotification({ to, channel: "whatsapp", templateKey, message });
  if (whatsapp.status === "sent") return whatsapp;
  return dispatchNotification({ to, channel: "sms", templateKey, message });
}
