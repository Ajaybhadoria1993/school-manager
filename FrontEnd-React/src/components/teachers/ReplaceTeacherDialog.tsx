import { useState } from "react";
import { Repeat2 } from "lucide-react";
import { Button } from "@heroui/react";
import { useGetTeachersQuery, useReplaceTeacherMutation } from "../../redux/api/timetableApi";
import type { Teacher } from "../../types";
import { useSave } from "../classes/useSave";
import { AppModal, ModalError } from "../ui/AppModal";
import { Field } from "../ui/Field";
import { Select } from "../ui/Select";
import { useToast } from "../ui/toast-context";

/** Gives all of one teacher's classes and lessons to another (a teacher who has left), and can make them inactive in the same step. */
export function ReplaceTeacherDialog({ teacher, onClose }: { teacher: Teacher; onClose: () => void }) {
  const [replace] = useReplaceTeacherMutation();
  const { push } = useToast();
  const others = (useGetTeachersQuery({ status: "active" }).data?.data.items ?? []).filter((t) => t.id !== teacher.id);
  const [withId, setWithId] = useState("");
  const [deactivate, setDeactivate] = useState(true);
  const { busy, error, run } = useSave(onClose);

  return (
    <AppModal
      title={`Give ${teacher.name}'s classes to another teacher`}
      icon={Repeat2}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onPress={onClose} isDisabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            isPending={busy}
            isDisabled={withId === ""}
            onPress={() =>
              void run(async () => {
                const res = await replace({ id: teacher.id, withTeacherId: withId, deactivate }).unwrap();
                push("success", `${res.data.allotments} subject${res.data.allotments === 1 ? "" : "s"} and ${res.data.lessons} lesson${res.data.lessons === 1 ? "" : "s"} given over`);
              })
            }
          >
            Give them over
          </Button>
        </>
      }
    >
      <p className="text-sm text-foreground-muted">
        {teacher.name} teaches {teacher.load.sections} class{teacher.load.sections === 1 ? "" : "es"} ({teacher.load.periodsAllotted} periods a week). The other teacher takes all of it, in every timetable. If they are busy at any of those periods nothing is changed and you are told where.
      </p>
      <Field id="replace-with" label="The other teacher">
        <Select id="replace-with" value={withId} placeholder="Choose a teacher" options={others.map((t) => ({ value: t.id, label: t.name }))} onChange={setWithId} />
      </Field>
      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
        <input type="checkbox" className="size-4 accent-primary" checked={deactivate} onChange={(e) => setDeactivate(e.target.checked)} />
        {teacher.name} has left: make them inactive
      </label>
      <ModalError message={error?.message ?? null} />
    </AppModal>
  );
}
