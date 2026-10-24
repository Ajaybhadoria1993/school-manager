import { useState } from "react";
import { DoorOpen, Plus, Users } from "lucide-react";
import { Button } from "@heroui/react";
import { MAX_SECTION_CAPACITY } from "../../../constants/academics";
import { useCreateSectionMutation } from "../../../redux/api/academicsApi";
import { getApiError } from "../../../utils/apiErrors";
import { AppModal, ModalError } from "../../ui/AppModal";
import { Field } from "../../ui/Field";
import { Input } from "../../ui/Input";
import { useToast } from "../../ui/toast-context";

type Box = "name" | "seats" | "room";

const FORM_ID = "add-section-form";
/** The server names a box by the field of the request: `capacity` is the seats. */
const BOX_OF: Record<string, Box> = { name: "name", capacity: "seats", room: "room" };

/**
 * Adds a section to the open class. It asks for the name (the next free letter is filled in), the seats and the room. When the
 * school requires seats and room (`required`) the boxes carry a red star and are checked here first with the words the server uses;
 * the server checks them again and its answer, box by box, is shown under the right box (so a request that skipped this check, or a
 * school that switched the rule while this was open, gets the same refusal). When they are optional the boxes may stay empty.
 */
export function AddSectionModal({
  classId,
  className,
  suggestedName,
  required,
  onClose,
}: {
  classId: string;
  className: string;
  suggestedName: string;
  required: boolean;
  onClose: () => void;
}) {
  const { push } = useToast();
  const [create] = useCreateSectionMutation();
  const [values, setValues] = useState<Record<Box, string>>({ name: suggestedName, seats: "", room: "" });
  const [problems, setProblems] = useState<Partial<Record<Box | "form", string>>>({});
  const [busy, setBusy] = useState(false);

  const change = (box: Box) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [box]: e.target.value }));
    setProblems((p) => ({ ...p, [box]: undefined, form: undefined }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const name = values.name.trim().replace(/\s+/g, " ");
    const seatsText = values.seats.trim();
    const room = values.room.trim();
    const seats = seatsText === "" ? null : Number(seatsText);

    const wrong: typeof problems = {};
    if (!name) wrong.name = "Enter the section name.";
    if (seats === null ? required : !Number.isInteger(seats) || seats < 1 || seats > MAX_SECTION_CAPACITY) {
      wrong.seats = seats === null ? "Enter the seats." : `Seats must be a whole number from 1 to ${MAX_SECTION_CAPACITY}.`;
    }
    if (required && !room) wrong.room = "Enter the room.";
    setProblems(wrong);
    if (Object.keys(wrong).length > 0) return;

    setBusy(true);
    try {
      await create({ classId, name, capacity: seats, room: room || null }).unwrap();
      push("success", `${className} - ${name} added`);
      onClose();
    } catch (err) {
      const apiError = getApiError(err);
      const next: typeof problems = {};
      for (const d of (Array.isArray(apiError?.details) ? apiError.details : []) as { path?: string; message?: string }[]) {
        const box = d.path ? BOX_OF[d.path] : undefined;
        if (box && d.message && !next[box]) next[box] = `${d.message}.`;
      }
      // A name already used in this class is the name box's to show.
      if (apiError?.code === "SECTION_EXISTS") next.name = apiError.message;
      if (Object.keys(next).length === 0) next.form = apiError?.message ?? "Could not add the section. Please try again.";
      setProblems(next);
      setBusy(false);
    }
  }

  return (
    <AppModal
      title={`Add a section to ${className}`}
      icon={Plus}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onPress={onClose} isDisabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" isPending={busy}>
            Add section
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="space-y-4">
        <Field id="new-section-name" label="Section name" error={problems.name} hint="For example A, B, C, or a stream such as Science.">
          <Input id="new-section-name" value={values.name} maxLength={20} autoFocus autoComplete="off" aria-invalid={!!problems.name} onChange={change("name")} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="new-section-seats"
            label="Seats"
            optional={!required}
            error={problems.seats}
            hint="The most students this section should have."
          >
            <Input
              id="new-section-seats"
              icon={Users}
              inputMode="numeric"
              value={values.seats}
              maxLength={3}
              placeholder={required ? "For example 40" : "No limit"}
              aria-invalid={!!problems.seats}
              onChange={change("seats")}
            />
          </Field>
          <Field
            id="new-section-room"
            label="Room"
            optional={!required}
            error={problems.room}
            hint="Where it sits, for example Room 12."
          >
            <Input
              id="new-section-room"
              icon={DoorOpen}
              value={values.room}
              maxLength={30}
              placeholder={required ? "For example Room 12" : "Not set"}
              aria-invalid={!!problems.room}
              onChange={change("room")}
            />
          </Field>
        </div>

        <p className="text-xs text-foreground-muted">
          {required
            ? "Seats and room are required: your school asked for them on every section. You can change that with the switch above the sections."
            : "Seats and room are optional: your school made them optional with the switch above the sections."}
        </p>
        <ModalError message={problems.form ?? null} />
      </form>
    </AppModal>
  );
}
