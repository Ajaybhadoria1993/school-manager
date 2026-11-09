import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { loginMessage } from "../../utils/teachers";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

/**
 * The username and the password of a teacher's login, shown once: the password is kept only as a hash, so this is the school's one
 * chance to read it. One button copies them as a message to send. It stays on the screen until the page is left.
 */
export function CredentialsCard({ teacher, username, password }: { teacher: string; username: string; password: string }) {
  const { tenant } = useAuth();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    const text = loginMessage({ school: tenant?.name, teacher, username, password, origin: window.location.origin });
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2500);
  }

  return (
    <Card role="region" aria-label="Login details" className="space-y-4 p-5 sm:p-6">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-bold uppercase tracking-wider text-foreground-muted">Username</dt>
          <dd className="mt-1 select-all break-all font-mono text-base font-semibold text-foreground">{username}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase tracking-wider text-foreground-muted">Password</dt>
          <dd className="mt-1 select-all break-all font-mono text-base font-semibold text-foreground">{password}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={() => void copy()} aria-live="polite">
          {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Copied" : "Copy login details"}
        </Button>
        <p className="text-xs text-foreground-muted">The password cannot be seen again after you leave this page.</p>
      </div>
    </Card>
  );
}
