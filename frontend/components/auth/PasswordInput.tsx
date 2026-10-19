"use client";

import { InputHTMLAttributes, useState } from "react";
import { Eye, EyeOff, Lock, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/Input";

/** Password field with a lock icon and a show/hide button. All normal input props pass through. */
export function PasswordInput({
  icon = Lock,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { icon?: LucideIcon }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} icon={icon} type={visible ? "text" : "password"} className="pr-11" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-foreground-muted transition-colors hover:bg-surface/70 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
