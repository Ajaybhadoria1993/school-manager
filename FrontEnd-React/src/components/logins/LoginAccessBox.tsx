import { KeyRound } from "lucide-react";
import { cn } from "../../utils/helpers";

/**
 * "Give login access" (2026-11-26), in Add teacher and Add staff: ticked, the person's email is their login and an invitation goes to it
 * (they choose their own password; the school makes no username or password), so the email box becomes needed. Left unticked, the person
 * is added without a login; the school can give one later from the list or their page.
 */
export function LoginAccessBox({ id, checked, onChange, className }: { id: string; checked: boolean; onChange: (next: boolean) => void; className?: string }) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 transition-colors",
        checked ? "border-primary/40 bg-primary/5" : "border-border bg-surface hover:bg-background",
        className
      )}
    >
      <input id={id} type="checkbox" className="size-4 shrink-0 accent-[var(--color-primary)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <KeyRound className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="text-sm font-semibold text-foreground">Give login access</span>
    </label>
  );
}
