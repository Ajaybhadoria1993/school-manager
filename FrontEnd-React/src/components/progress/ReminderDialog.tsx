import { useState } from "react";
import { BellRing } from "lucide-react";
import { Button as HeroButton } from "@heroui/react";
import { useGetReminderQuery, useSaveReminderMutation } from "../../redux/api/classroomApi";
import { getApiError } from "../../utils/apiErrors";
import { clock12 } from "../../utils/exams";
import { reminderTimes } from "../../utils/teachingProgress";
import type { ClassworkReminder } from "../../types";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { Field } from "../ui/Field";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { Switch } from "../ui/Switch";

/**
 * The school's daily reminder (docs/teaching-progress.md): whether teachers who have not written the day's diary are told, and at what
 * time. `onSaved` gets the words for the window that says what will happen.
 */
export function ReminderDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (words: string) => void }) {
  const res = useGetReminderQuery();
  const [save] = useSaveReminderMutation();
  const [changed, setChanged] = useState<ClassworkReminder | null>(null);
  const value = changed ?? res.data?.data;
  const { busy, error, run } = useSave(() => undefined);

  function send() {
    if (!value) return;
    void run(async () => {
      await save(value).unwrap();
      onSaved(value.enabled ? `Teachers who have not written the diary are reminded at ${clock12(value.time)}.` : "No teacher is reminded about the diary.");
    });
  }

  return (
    <AppModal
      title="Diary reminder"
      icon={BellRing}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <HeroButton variant="secondary" onPress={onClose} isDisabled={busy}>
            Cancel
          </HeroButton>
          <HeroButton variant="primary" isPending={busy} isDisabled={!value} onPress={send}>
            Save
          </HeroButton>
        </>
      }
    >
      {value ? (
        <>
          <Switch checked={value.enabled} onChange={(enabled) => setChanged({ ...value, enabled })}>
            Remind teachers who have not written the diary
          </Switch>
          <Field id="reminder-time" label="Time">
            <Select id="reminder-time" value={value.time} disabled={!value.enabled} options={reminderTimes(value.time)} onChange={(time) => time && setChanged({ ...value, time })} />
          </Field>
        </>
      ) : res.isError ? null : (
        <Skeleton className="h-24 rounded-xl" />
      )}
      <ModalError message={error?.message ?? (res.isError ? (getApiError(res.error)?.message ?? "Could not load the reminder.") : null)} />
    </AppModal>
  );
}
