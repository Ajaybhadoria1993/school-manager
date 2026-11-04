import { useState } from "react";
import { AtSign } from "lucide-react";
import { Button } from "@heroui/react";
import { useUsernameCheck } from "../../hooks/useUsernameCheck";
import { useChangeTeacherUsernameMutation } from "../../redux/api/timetableApi";
import type { Teacher } from "../../types";
import { MESSAGES } from "../../utils/teachers";
import { isUsername } from "../../utils/validators";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { useToast } from "../ui/toast-context";
import { UsernameState } from "./UsernameState";

const BOX = "change-username";

/**
 * Another username for a teacher's login: checked free on the whole platform while it is typed (a taken one offers free ones), saved
 * with one button. The password stays as it is, and so do the teacher's sessions; tell the teacher the new username.
 */
export function ChangeUsernameDialog({ teacher, onClose }: { teacher: Teacher; onClose: () => void }) {
  const current = teacher.login?.username ?? "";
  const [change] = useChangeTeacherUsernameMutation();
  const { push } = useToast();
  const [username, setUsername] = useState(current);
  const [tried, setTried] = useState(false);
  const wanted = username.trim().toLowerCase();
  const check = useUsernameCheck(username, wanted !== current);
  const { busy, error, run, clearError } = useSave(() => undefined);
  const serverSays = Array.isArray(error?.details) ? (error.details as { path?: string; message?: string }[]).find((d) => d.path === "username")?.message : undefined;
  const problem = tried && !isUsername(wanted) ? MESSAGES.username : serverSays;
  const taken = !problem && check.state === "taken";

  function save() {
    setTried(true);
    if (!isUsername(wanted) || taken) return;
    if (wanted === current) return onClose();
    void run(async () => {
      await change({ id: teacher.id, username: wanted }).unwrap();
      push("success", `${teacher.name}'s username is ${wanted}`);
      onClose();
    });
  }

  return (
    <AppModal
      title={`Change the username of ${teacher.name}`}
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
        <Field id={BOX} label="Username" error={problem}>
          <Input
            id={BOX}
            value={username}
            maxLength={30}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={problem || taken ? true : undefined}
            aria-describedby={problem ? `${BOX}-error` : taken ? `${BOX}-taken` : undefined}
            onChange={(e) => {
              setUsername(e.target.value);
              clearError();
            }}
          />
          {!problem && <UsernameState check={check} takenId={`${BOX}-taken`} onPick={(name) => setUsername(name)} />}
        </Field>
      </form>
      <ModalError message={error && !serverSays ? error.message : null} />
    </AppModal>
  );
}
