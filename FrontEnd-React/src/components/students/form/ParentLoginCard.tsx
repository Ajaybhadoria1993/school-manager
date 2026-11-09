import { KeyRound } from "lucide-react";
import type { useUsernameCheck } from "../../../hooks/useUsernameCheck";
import { generatePassword } from "../../../utils/teachers";
import { PasswordBox } from "../../teachers/PasswordBox";
import { UsernameState } from "../../teachers/UsernameState";
import { Card } from "../../ui/Card";
import { Field } from "../../ui/Field";
import { Input } from "../../ui/Input";

/** The parent's login Add student may make (off until ticked). */
export interface ParentLoginChoice {
  on: boolean;
  username: string;
  password: string;
  /** The username was typed by the person (it no longer follows the parent's name). */
  typed: boolean;
}

/**
 * Add student's Parent login (2026-11-04), under the parents: a tick makes the primary parent a login right after the admission (a
 * username from their name, checked free on the whole platform as it is typed, and a password already made); the student's page then
 * shows them once to hand over. A parent the school already has, with a login, needs none: the new child joins that login.
 */
export function ParentLoginCard({
  parentName,
  existing,
  value,
  onChange,
  check,
  problems,
}: {
  parentName: string;
  /** The username of the primary parent's login, when the school already has them with one. */
  existing: string | null;
  value: ParentLoginChoice;
  onChange: (patch: Partial<ParentLoginChoice>) => void;
  check: ReturnType<typeof useUsernameCheck>;
  problems: { username?: string; password?: string };
}) {
  const who = parentName.trim() || "the primary parent";
  const taken = !problems.username && check.state === "taken";
  return (
    <Card role="region" aria-label="Parent login" className="space-y-4 p-5">
      <h3 className="flex items-center gap-2 text-base font-bold tracking-tight text-foreground">
        <KeyRound className="size-5 text-primary" aria-hidden />
        Parent login
      </h3>
      {existing ? (
        <p className="text-sm text-foreground">
          {who} already signs in as <span className="font-mono font-semibold">{existing}</span>. This child joins that login.
        </p>
      ) : (
        <>
          <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm font-semibold text-foreground">
            <input type="checkbox" className="size-4 accent-primary" checked={value.on} onChange={(e) => onChange({ on: e.target.checked })} />
            Make a login for {who}
          </label>
          {value.on && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="parent-login-username" label="Username" error={problems.username}>
                <Input
                  id="parent-login-username"
                  value={value.username}
                  maxLength={30}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={problems.username || taken ? true : undefined}
                  aria-describedby={problems.username ? "parent-login-username-error" : taken ? "parent-login-username-taken" : undefined}
                  onChange={(e) => onChange({ username: e.target.value, typed: true })}
                />
                {!problems.username && <UsernameState check={check} takenId="parent-login-username-taken" onPick={(username) => onChange({ username, typed: true })} />}
              </Field>
              <Field id="parent-login-password" label="Password" error={problems.password}>
                <PasswordBox
                  id="parent-login-password"
                  value={value.password}
                  aria-invalid={problems.password ? true : undefined}
                  onChange={(e) => onChange({ password: e.target.value })}
                  onMakeAnother={() => onChange({ password: generatePassword() })}
                />
              </Field>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
