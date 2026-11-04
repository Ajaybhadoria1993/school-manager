import { useState } from "react";
import { AtSign, KeyRound, UserRoundCog } from "lucide-react";
import { Button } from "@heroui/react";
import { useFreeUsername, useUsernameCheck } from "../../hooks/useUsernameCheck";
import { defaultUsername, generatePassword, MESSAGES } from "../../utils/teachers";
import { isPasswordValid, isUsername } from "../../utils/validators";
import { useSave } from "../classes/useSave";
import { CredentialsCard } from "../teachers/CredentialsCard";
import { PasswordBox } from "../teachers/PasswordBox";
import { UsernameState } from "../teachers/UsernameState";
import { AppModal, ModalError } from "../ui/AppModal";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";

/**
 * The windows of a login that is not a teacher's (a parent's, 2026-11-04), given what to call the person and what saving does. Like the
 * teacher's: the username is checked free on the whole platform as it is typed (a taken one offers free ones), the password is made
 * already (it can be typed or made again), and after saving the username and the password are shown ONCE, to hand over.
 */

/** What the server said about one box (`details` are { path, message }), by the last part of the path. */
function boxesOf(error: { details?: unknown } | null | undefined): Record<string, string> {
  const details = Array.isArray(error?.details) ? (error.details as { path?: string; message?: string }[]) : [];
  return Object.fromEntries(details.filter((d) => d.path && d.message).map((d) => [d.path!.split(".").pop()!, d.message!]));
}

function UsernameBox({ id, value, problem, check, onChange }: { id: string; value: string; problem?: string; check: ReturnType<typeof useUsernameCheck>; onChange: (v: string) => void }) {
  const taken = !problem && check.state === "taken";
  return (
    <Field id={id} label="Username" error={problem}>
      <Input
        id={id}
        value={value}
        maxLength={30}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-invalid={problem || taken ? true : undefined}
        aria-describedby={problem ? `${id}-error` : taken ? `${id}-taken` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {!problem && <UsernameState check={check} takenId={`${id}-taken`} onPick={onChange} />}
    </Field>
  );
}

/** A login for a person who has none: a username from the name (with a number) and a password already made. */
export function MakeLoginDialog({ name, onCreate, onClose }: { name: string; onCreate: (username: string, password: string) => Promise<string>; onClose: () => void }) {
  const [username, setUsername] = useState(() => defaultUsername(name));
  const [typed, setTyped] = useState(false);
  const [password, setPassword] = useState(generatePassword);
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState<{ username: string; password: string } | null>(null);
  const { busy, error, run, clearError } = useSave(() => undefined);
  const wanted = username.trim().toLowerCase();
  const check = useUsernameCheck(username, done === null);
  useFreeUsername(check, typed, setUsername);
  const boxes = boxesOf(error);
  const usernameProblem = tried && !isUsername(wanted) ? MESSAGES.username : boxes.username;
  const passwordProblem = tried && !isPasswordValid(password) ? MESSAGES.password : boxes.password;

  function save() {
    setTried(true);
    if (!isUsername(wanted) || !isPasswordValid(password) || (!usernameProblem && check.state === "taken")) return;
    void run(async () => {
      const made = await onCreate(wanted, password);
      setDone({ username: made || wanted, password });
    });
  }

  return (
    <AppModal
      title={`Make a login for ${name}`}
      icon={UserRoundCog}
      busy={busy}
      onClose={onClose}
      footer={
        done !== null ? (
          <Button variant="primary" onPress={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="secondary" onPress={onClose} isDisabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" isPending={busy} onPress={save}>
              Make login
            </Button>
          </>
        )
      }
    >
      {done !== null ? (
        <CredentialsCard teacher={name} username={done.username} password={done.password} />
      ) : (
        <>
          <UsernameBox
            id="make-login-username"
            value={username}
            problem={usernameProblem}
            check={check}
            onChange={(v) => {
              setUsername(v);
              setTyped(true);
              clearError();
            }}
          />
          <Field id="make-login-password" label="Password" error={passwordProblem}>
            <PasswordBox
              id="make-login-password"
              value={password}
              aria-invalid={passwordProblem ? true : undefined}
              onChange={(e) => {
                setPassword(e.target.value);
                clearError();
              }}
              onMakeAnother={() => {
                setPassword(generatePassword());
                clearError();
              }}
            />
          </Field>
          <ModalError message={error && Object.keys(boxes).length === 0 ? error.message : null} />
        </>
      )}
    </AppModal>
  );
}

/** A new password for a login (the person forgot it, or lost the one they were given): shown once when saved; the old one stops. */
export function NewPasswordDialog({ name, username, onSave, onClose }: { name: string; username: string; onSave: (password: string) => Promise<void>; onClose: () => void }) {
  const [password, setPassword] = useState(generatePassword);
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const { busy, error, run, clearError } = useSave(() => undefined);
  const problem = tried && !isPasswordValid(password) ? MESSAGES.password : boxesOf(error).password;

  function save() {
    setTried(true);
    if (!isPasswordValid(password)) return;
    void run(async () => {
      await onSave(password);
      setDone(password);
    });
  }

  return (
    <AppModal
      title={`New password for ${name}`}
      icon={KeyRound}
      busy={busy}
      onClose={onClose}
      footer={
        done !== null ? (
          <Button variant="primary" onPress={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="secondary" onPress={onClose} isDisabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" isPending={busy} onPress={save}>
              Change password
            </Button>
          </>
        )
      }
    >
      {done !== null ? (
        <CredentialsCard teacher={name} username={username} password={done} />
      ) : (
        <>
          <Field id="new-password" label="Password" error={problem}>
            <PasswordBox
              id="new-password"
              value={password}
              aria-invalid={problem ? true : undefined}
              onChange={(e) => {
                setPassword(e.target.value);
                clearError();
              }}
              onMakeAnother={() => {
                setPassword(generatePassword());
                clearError();
              }}
            />
          </Field>
          <ModalError message={error && !boxesOf(error).password ? error.message : null} />
        </>
      )}
    </AppModal>
  );
}

/** Another username (checked free as it is typed); the password and the person's sessions stay. */
export function ChangeUsernameDialog({ name, current, onSave, onClose }: { name: string; current: string; onSave: (username: string) => Promise<void>; onClose: () => void }) {
  const [username, setUsername] = useState(current);
  const [tried, setTried] = useState(false);
  const wanted = username.trim().toLowerCase();
  const check = useUsernameCheck(username, wanted !== current);
  const { busy, error, run, clearError } = useSave(() => undefined);
  const serverSays = boxesOf(error).username;
  const problem = tried && !isUsername(wanted) ? MESSAGES.username : serverSays;

  function save() {
    setTried(true);
    if (!isUsername(wanted) || (!problem && check.state === "taken")) return;
    if (wanted === current) return onClose();
    void run(async () => {
      await onSave(wanted);
      onClose();
    });
  }

  return (
    <AppModal
      title={`Change the username of ${name}`}
      icon={AtSign}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onPress={onClose} isDisabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" isPending={busy} onPress={save}>
            Save username
          </Button>
        </>
      }
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <UsernameBox
          id="change-login-username"
          value={username}
          problem={problem}
          check={check}
          onChange={(v) => {
            setUsername(v);
            clearError();
          }}
        />
      </form>
      <ModalError message={error && !serverSays ? error.message : null} />
    </AppModal>
  );
}
