import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { PASSWORD_RULES } from "@/lib/validators";

/** Live list of the password rules; each turns green as the typed password satisfies it. */
export function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul className="mt-2 space-y-1" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password);
        return (
          <li key={rule.id} className={cn("flex items-center gap-2 text-xs", ok ? "text-success" : "text-foreground-muted")}>
            {ok ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3.5" aria-hidden />}
            <span>
              {rule.label}
              <span className="sr-only">{ok ? " (done)" : " (not yet)"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
