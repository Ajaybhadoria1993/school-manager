import { useId } from "react";
import { cn } from "../../utils/helpers";

/**
 * An on / off switch with its label, for a setting that takes effect when it is flipped. It is a real switch for a screen reader
 * (`role="switch"`, `aria-checked`), works with Space and Enter, and while `busy` it shows the new state at once but ignores
 * further presses until the answer arrives. `children` is the label; `hint` is a small line under it.
 */
export function Switch({
  checked,
  onChange,
  busy = false,
  disabled = false,
  hint,
  children,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  busy?: boolean;
  disabled?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-busy={busy || undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
        disabled={disabled}
        onClick={() => !busy && onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-primary" : "bg-border",
          busy && "opacity-70"
        )}
      >
        <span
          aria-hidden
          className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform duration-200", checked ? "translate-x-[1.375rem]" : "translate-x-0.5")}
        />
      </button>
      <label htmlFor={id} className="min-w-0 cursor-pointer select-none">
        <span className="block text-sm font-semibold text-foreground">{children}</span>
        {hint && (
          <span id={`${id}-hint`} className="block text-xs text-foreground-muted">
            {hint}
          </span>
        )}
      </label>
    </div>
  );
}
