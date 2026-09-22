import Razorpay from "razorpay";
import crypto from "crypto";
import { env } from "../config/env";

let client: Razorpay | null = null;

function getClient(): Razorpay {
  if (!env.isRazorpayConfigured) {
    throw new Error("Razorpay is not configured. Set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET to enable online payments.");
  }
  if (!client) {
    client = new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
  }
  return client;
}

export async function createOrder(amountInRupees: number, receipt: string) {
  const rzp = getClient();
  return rzp.orders.create({
    amount: Math.round(amountInRupees * 100), // paise
    currency: "INR",
    receipt,
  });
}

export function verifySignature(orderId: string, paymentId: string, signature: string): boolean {
  const expected = crypto
    .createHmac("sha256", env.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  return expected === signature;
}

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const expected = crypto
    .createHmac("sha256", env.razorpay.webhookSecret)
    .update(rawBody)
    .digest("hex");
  return expected === signature;
}
