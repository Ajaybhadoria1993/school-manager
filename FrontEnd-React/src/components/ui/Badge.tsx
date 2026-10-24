import { HTMLAttributes } from "react";
import { cn } from "../../utils/helpers";

type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

// Pill badges: a tint, a darker text colour and a hairline of the same hue, as the design system defines them.
const toneClasses: Record<Tone, string> = {
  neutral: "border-[#cbd5e1] bg-surface-muted text-[#334155]",
  primary: "border-[#bfdbfe] bg-primary-soft text-primary-deep",
  success: "border-success-line bg-success-soft text-success",
  warning: "border-warning-line bg-warning-soft text-warning",
  danger: "border-danger-line bg-danger-soft text-danger",
  info: "border-info-line bg-info-soft text-info",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-semibold",
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
