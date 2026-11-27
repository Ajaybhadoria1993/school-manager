import { useEffect, useRef, useState } from "react";
import { Check, Copy, MailCheck, TriangleAlert } from "lucide-react";
import type { LoginInvite } from "../../types";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

/**
 * What the school sees after a login invitation went out (Add teacher / Add staff with login access, Give login access, Resend): the email it
 * went to, and that the login stays Pending until the person opens it and chooses a password. An email that did not go out is said plainly
 * (send it again). `devInviteLink` comes only from a development server with no email service: the link itself, to copy.
 */
export function InviteSentCard({ invite }: { invite: LoginInvite }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2500);
  }

  return (
    <Card role="region" aria-label="Login invitation" className="space-y-3 p-5 sm:p-6">
      {invite.emailSent ? (
        <p className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
          <MailCheck className="size-5 shrink-0 text-success" aria-hidden />
          Invitation sent to <span className="break-all">{invite.email}</span>
        </p>
      ) : (
        <p role="alert" className="flex items-center gap-2.5 text-sm font-semibold text-warning">
          <TriangleAlert className="size-5 shrink-0" aria-hidden />
          The email to <span className="break-all">{invite.email}</span> could not be sent. Use Resend invitation.
        </p>
      )}
      <p className="text-sm text-foreground-muted">Login is Pending until they open the link and set their password.</p>
      {invite.devInviteLink && (
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-background px-2.5 py-1.5 text-xs">{invite.devInviteLink}</code>
          <Button type="button" variant="outline" size="sm" onClick={() => void copy(invite.devInviteLink!)} aria-live="polite">
            {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      )}
    </Card>
  );
}
