"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast-context";
import { api, ApiRequestError } from "@/lib/api";
import type { ApiResponse } from "@/types";

interface OrderResponse {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  transactionId: string;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function PayOnlineButton({
  studentId,
  installmentName,
  amount,
  studentName,
  onPaid,
}: {
  studentId: string;
  installmentName: string;
  amount: number;
  studentName: string;
  onPaid: () => void;
}) {
  const { push } = useToast();
  const [loading, setLoading] = useState(false);

  async function pay() {
    setLoading(true);
    try {
      const res = await api.post<ApiResponse<OrderResponse>>("/fees/online/order", {
        studentId,
        installmentName,
        amount,
      });
      const order = res.data;

      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        push("error", "Could not load the payment gateway. Please try again.");
        return;
      }

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: "School Fee Payment",
        description: `${installmentName} fee for ${studentName}`,
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await api.post("/fees/online/verify", {
              transactionId: order.transactionId,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            push("success", "Payment successful — receipt generated");
            onPaid();
          } catch {
            push("error", "Payment verification failed. Contact the school if the amount was debited.");
          }
        },
        theme: { color: "#4338ca" },
      });
      rzp.open();
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 503) {
        push("info", "Online payments aren't set up yet for this school — please pay at the office, or ask admin to configure Razorpay.");
      } else {
        push("error", err instanceof ApiRequestError ? err.message : "Unable to start payment");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button size="sm" onClick={pay} loading={loading}>
      <CreditCard className="size-4" />
      Pay via UPI
    </Button>
  );
}
