import { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-muted text-foreground-muted",
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}

export const attendanceTone: Record<string, Tone> = {
  present: "success",
  absent: "danger",
  late: "warning",
  half_day: "info",
  excused: "neutral",
};

export const feeStatusTone: Record<string, Tone> = {
  paid: "success",
  partial: "warning",
  unpaid: "danger",
};

export const transactionStatusTone: Record<string, Tone> = {
  success: "success",
  pending: "warning",
  failed: "danger",
  bounced: "danger",
  reversed: "neutral",
};
