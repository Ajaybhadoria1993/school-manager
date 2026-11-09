import { useState } from "react";
import { AtSign, KeyRound, UserRoundCog } from "lucide-react";
import { useReadOnlyYear } from "../../../hooks/useReadOnlyYear";
import { useChangeGuardianUsernameMutation, useCreateGuardianLoginMutation, useResetGuardianPasswordMutation } from "../../../redux/api/studentsApi";
import type { StudentGuardian } from "../../../types";
import { ChangeUsernameDialog, MakeLoginDialog, NewPasswordDialog } from "../../logins/LoginDialogs";
import { Button } from "../../ui/Button";
import { useToast } from "../../ui/toast-context";

/**
 * A parent's login on their card of the student's page (2026-11-04): the username (never the password) with Change username and New
 * password, or Make a login. One login is the parent's for all their children: making it here makes it on every child's page.
 */
export function GuardianLogin({ guardian }: { guardian: StudentGuardian }) {
  const [dialog, setDialog] = useState<"make" | "password" | "username" | null>(null);
  const [create] = useCreateGuardianLoginMutation();
  const [reset] = useResetGuardianPasswordMutation();
  const [rename] = useChangeGuardianUsernameMutation();
  const { push } = useToast();
  const readOnly = useReadOnlyYear();
  const login = guardian.login ?? null;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
      <p className="min-w-0 text-sm">
        <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">Login</span>
        {login ? <span className={login.isActive ? "font-mono font-semibold text-foreground" : "font-mono text-foreground-muted line-through"}>{login.username}</span> : <span className="text-foreground-muted">No login yet</span>}
      </p>
      {/* A year that is over is only looked at: the login is read, not changed. */}
      <div className={readOnly ? "hidden" : "flex flex-wrap gap-1.5"}>
        {login ? (
          <>
            <Button variant="outline" size="sm" aria-label={`Change the username of ${guardian.name}`} onClick={() => setDialog("username")}>
              <AtSign className="size-3.5" aria-hidden />
              Username
            </Button>
            <Button variant="outline" size="sm" aria-label={`New password for ${guardian.name}`} onClick={() => setDialog("password")}>
              <KeyRound className="size-3.5" aria-hidden />
              New password
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" aria-label={`Make a login for ${guardian.name}`} onClick={() => setDialog("make")}>
            <UserRoundCog className="size-3.5" aria-hidden />
            Make a login
          </Button>
        )}
      </div>

      {dialog === "make" && (
        <MakeLoginDialog
          name={guardian.name}
          onCreate={async (username, password) => (await create({ id: guardian.id, username, password }).unwrap()).data.login.username}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "password" && login && (
        <NewPasswordDialog name={guardian.name} username={login.username} onSave={async (password) => void (await reset({ id: guardian.id, password }).unwrap())} onClose={() => setDialog(null)} />
      )}
      {dialog === "username" && login && (
        <ChangeUsernameDialog
          name={guardian.name}
          current={login.username}
          onSave={async (username) => {
            await rename({ id: guardian.id, username }).unwrap();
            push("success", `${guardian.name}'s username is ${username}`);
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
