import { Check, LoaderCircle } from "lucide-react";
import type { UsernameStatus } from "../../hooks/useUsernameCheck";

/**
 * Under a username box: whether it is free on the platform (Checking…, Available), or taken, with up to three free ones to take in one
 * click. `id` of the "taken" line is `takenId`, so the box can point at it (`aria-describedby`).
 */
export function UsernameState({ check, onPick, takenId = "username-taken" }: { check: UsernameStatus; onPick: (username: string) => void; takenId?: string }) {
  if (check.state !== "taken") return <UsernameProgress state={check.state} />;
  return (
    <div className="mt-1.5">
      <p id={takenId} role="alert" className="text-xs font-medium text-danger">
        This username is taken. Try another
      </p>
      {check.suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {check.suggestions.slice(0, 3).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onPick(name)}
              className="h-7 cursor-pointer rounded-md border border-border bg-surface px-2.5 font-mono text-xs font-semibold text-foreground transition-colors hover:border-primary/50 hover:bg-primary-soft hover:text-primary-deep focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UsernameProgress({ state }: { state: "idle" | "checking" | "free" }) {
  if (state === "idle") return null;
  if (state === "checking") {
    return (
      <p aria-live="polite" className="mt-1.5 flex items-center gap-1.5 text-xs text-foreground-muted">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
        Checking…
      </p>
    );
  }
  return (
    <p aria-live="polite" className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-success">
      <Check className="size-3.5" aria-hidden />
      Available
    </p>
  );
}
