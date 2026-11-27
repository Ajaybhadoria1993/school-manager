import { useState } from "react";
import { Mail, Send } from "lucide-react";
import { Button } from "@heroui/react";
import type { LoginAction, LoginInvite } from "../../types";
import { isEmail } from "../../utils/validators";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { InviteSentCard } from "./InviteSentCard";

const TITLES: Record<LoginAction, (name: string) => string> = {
  give: (name) => `Give login access to ${name}`,
  resend: (name) => `Resend invitation to ${name}`,
  reset: (name) => `Send ${name} a password link`,
};

/**
 * Give login access (2026-11-26), for a teacher or a staff member: the email (theirs already, or typed now when they have none; it becomes
 * their email and their login) gets an invitation to choose a password, and the login is Pending until they do. The same dialog sends a
 * Pending login its invitation again, and sends a login that works a link to choose a new password (the school never sets one). `send` is
 * the page's call to the server.
 */
export function GiveLoginDialog({
  name,
  email,
  action,
  send,
  onClose,
}: {
  name: string;
  email: string | null;
  action: LoginAction;
  send: (email: string) => Promise<LoginInvite | undefined>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(email ?? "");
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState<LoginInvite | null>(null);
  const { busy, error, run, clearError } = useSave(() => undefined);
  const boxError = Array.isArray(error?.details) ? (error.details as { path?: string; message?: string }[]).find((d) => d.path === "email")?.message : undefined;
  const typed = value.trim().toLowerCase();
  const problem = tried && typed === "" ? "Enter the email: the login invitation is sent to it" : tried && !isEmail(typed) ? "Enter a valid email address" : boxError;

  function save() {
    setTried(true);
    if (typed === "" || !isEmail(typed)) return;
    void run(async () => {
      const invite = await send(typed);
      if (invite) setDone(invite);
      else onClose();
    });
  }

  return (
    <AppModal
      title={TITLES[action](name)}
      icon={Send}
      busy={busy}
      onClose={onClose}
      footer={
        done ? (
          <Button variant="primary" onPress={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="secondary" onPress={onClose} isDisabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" isPending={busy} onPress={save}>
              {action === "reset" ? "Send link" : "Send invitation"}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <InviteSentCard invite={done} />
      ) : (
        <>
          <Field id="login-email" label="Email" error={problem}>
            <Input
              id="login-email"
              type="email"
              icon={Mail}
              maxLength={254}
              autoComplete="off"
              autoFocus
              value={value}
              aria-invalid={problem ? true : undefined}
              onChange={(e) => {
                setValue(e.target.value);
                clearError();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
              }}
            />
          </Field>
          <ModalError message={error && !boxError ? error.message : null} />
        </>
      )}
    </AppModal>
  );
}
