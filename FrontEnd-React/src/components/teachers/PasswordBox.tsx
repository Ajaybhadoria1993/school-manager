import type { InputHTMLAttributes } from "react";
import { RefreshCw } from "lucide-react";
import { Input } from "../ui/Input";

/**
 * A password the school is making for someone else: shown, not hidden (the school reads it out or sends it), in a typeface that tells
 * 0 from O, with a button inside the box that makes another one.
 */
export function PasswordBox({ onMakeAnother, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { onMakeAnother: () => void }) {
  return (
    <div className="relative">
      <Input {...props} type="text" maxLength={72} autoComplete="off" autoCapitalize="none" spellCheck={false} className={`pr-11 font-mono ${className ?? ""}`} />
      <button
        type="button"
        onClick={onMakeAnother}
        aria-label="Make another password"
        title="Make another password"
        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-foreground-muted transition-colors hover:bg-surface-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <RefreshCw className="size-4" aria-hidden />
      </button>
    </div>
  );
}
