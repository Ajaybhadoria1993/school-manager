import { useState } from "react";
import { Link } from "react-router";
import { KeyRound, UserRoundCog } from "lucide-react";
import { Button } from "@heroui/react";
import { useFreeUsername, useUsernameCheck } from "../../hooks/useUsernameCheck";
import { useCreateTeacherLoginMutation, useResetTeacherPasswordMutation } from "../../redux/api/timetableApi";
import type { Teacher } from "../../types";
import { generatePassword, isUsername, MESSAGES, suggestUsername } from "../../utils/teachers";
import { isPasswordValid } from "../../utils/validators";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { CredentialsCard } from "./CredentialsCard";
import { PasswordBox } from "./PasswordBox";
import { UsernameState } from "./UsernameState";

/** What the server said about one box (`details` are { path, message }): by the last part of the path (`login.username` is `username`). */
function boxesOf(error: { details?: unknown } | null | undefined): Record<string, string> {
  const details = Array.isArray(error?.details) ? (error.details as { path?: string; message?: string }[]) : [];
  return Object.fromEntries(details.filter((d) => d.path && d.message).map((d) => [d.path!.split(".").pop()!, d.message!]));
}

/**
 * A new password for a teacher who has a login (they forgot it, or lost the one they were given). The school's first choice is one
 * already made; it can be changed or made again. When it is saved the dialog shows it once, to hand over, and the teacher's other
 * sessions end.
 */
export function ResetPasswordDialog({ teacher, onClose }: { teacher: Teacher; onClose: () => void }) {
  const [reset] = useResetTeacherPasswordMutation();
  const [password, setPassword] = useState(generatePassword);
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const { busy, error, run, clearError } = useSave(() => undefined);
  const problem = tried && !isPasswordValid(password) ? MESSAGES.password : boxesOf(error).password;

  function save() {
    setTried(true);
    if (!isPasswordValid(password)) return;
    void run(async () => {
      await reset({ id: teacher.id, password }).unwrap();
      setDone(password);
    });
  }

  return (
    <AppModal
      title={`New password for ${teacher.name}`}
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
        <CredentialsCard teacher={teacher.name} username={teacher.login?.username ?? ""} password={done} />
      ) : (
        <>
          <Field id="reset-password" label="Password" error={problem}>
            <PasswordBox
              id="reset-password"
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

/** A login for a teacher who has none: a username from the name and a password already made, then what to hand over. */
export function MakeLoginDialog({ teacher, onClose }: { teacher: Teacher; onClose: () => void }) {
  const [create] = useCreateTeacherLoginMutation();
  const [username, setUsername] = useState(() => suggestUsername(teacher.name));
  const [typed, setTyped] = useState(false);
  const [password, setPassword] = useState(generatePassword);
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState<{ username: string; password: string } | null>(null);
  const { busy, error, run, clearError } = useSave(() => undefined);
  const boxes = boxesOf(error);
  const usernameProblem = tried && !isUsername(username) ? MESSAGES.username : boxes.username;
  // Checked free on the whole platform as it is typed; the one made from the name is swapped for a free one when it is taken.
  const check = useUsernameCheck(username, done === null && !!teacher.mobile);
  useFreeUsername(check, typed, setUsername);
  const passwordProblem = tried && !isPasswordValid(password) ? MESSAGES.password : boxes.password;
  const needsMobile = !teacher.mobile;

  function save() {
    setTried(true);
    if (!isUsername(username) || !isPasswordValid(password) || check.state === "taken") return;
    void run(async () => {
      const res = await create({ id: teacher.id, username: username.trim().toLowerCase(), password }).unwrap();
      setDone({ username: res.data.login?.username ?? username.trim().toLowerCase(), password });
    });
  }

  return (
    <AppModal
      title={`Make a login for ${teacher.name}`}
      icon={UserRoundCog}
      busy={busy}
      onClose={onClose}
      footer={
        done !== null || needsMobile ? (
          <Button variant="primary" onPress={onClose}>
            {done !== null ? "Done" : "Close"}
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
        <CredentialsCard teacher={teacher.name} username={done.username} password={done.password} />
      ) : needsMobile ? (
        <p className="text-sm text-foreground-muted">
          A login needs the teacher's mobile number.{" "}
          <Link to={`/school/teachers/${teacher.id}/edit`} aria-label={`Change ${teacher.name}`} className="font-semibold text-primary underline-offset-4 hover:underline">
            Add the mobile number
          </Link>{" "}
          first.
        </p>
      ) : (
        <>
          <Field id="login-username" label="Username" error={usernameProblem}>
            <Input
              id="login-username"
              value={username}
              maxLength={30}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={usernameProblem || (!usernameProblem && check.state === "taken") ? true : undefined}
              onChange={(e) => {
                setUsername(e.target.value);
                setTyped(true);
                clearError();
              }}
            />
            {!usernameProblem && (
              <UsernameState
                check={check}
                takenId="login-username-taken"
                onPick={(name) => {
                  setUsername(name);
                  setTyped(true);
                }}
              />
            )}
          </Field>
          <Field id="login-password" label="Password" error={passwordProblem}>
            <PasswordBox
              id="login-password"
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
