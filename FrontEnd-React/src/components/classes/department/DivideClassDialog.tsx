import { useState } from "react";
import { Rows3 } from "lucide-react";
import { Button } from "@heroui/react";
import { useDivideForm } from "../../../hooks/useDivideForm";
import { useDivideClassMutation } from "../../../redux/api/academicsApi";
import { getApiError } from "../../../utils/apiErrors";
import { plural } from "../../../utils/academics";
import { AppModal, ModalError } from "../../ui/AppModal";
import { useToast } from "../../ui/toast-context";
import { DivideFields } from "../DivideFields";

/**
 * "Divide this class into sections" from the class's own screen: for a class that has students sitting in the class itself, which a
 * section added by hand would leave in no section. It makes the sections and shares those students out between them by name (their roll
 * numbers stay), and says how many go where before anything is done. The same boxes as the full-class window of Add student, without the
 * one more student.
 */
export function DivideClassDialog({
  classId,
  className,
  enrolled,
  classSeats,
  needsRooms,
  onClose,
}: {
  classId: string;
  className: string;
  /** The students sitting in the class itself (the server counted them when it refused the first section). */
  enrolled: number;
  classSeats: number | null;
  needsRooms: boolean;
  onClose: () => void;
}) {
  const { push } = useToast();
  const [divide, { isLoading }] = useDivideClassMutation();
  const form = useDivideForm({ enrolled, newcomer: false, needsRooms });
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (form.problem) {
      setError(form.problem);
      return;
    }
    try {
      const res = await divide({ id: classId, ...form.request() }).unwrap();
      push("success", `${className} is divided into ${res.data.sections.map((s) => s.name).join(", ")}. ${plural(res.data.moved, "student")} shared out.`);
      onClose();
    } catch (err) {
      setError(getApiError(err)?.message ?? "Could not divide the class.");
    }
  }

  return (
    <AppModal
      title={`Divide ${className} into sections`}
      icon={Rows3}
      busy={isLoading}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onPress={onClose} isDisabled={isLoading}>
            Cancel
          </Button>
          <Button variant="primary" isPending={isLoading} onPress={() => void submit()}>
            Make sections
          </Button>
        </>
      }
    >
      <p className="text-sm text-foreground-muted">
        {className} has {plural(enrolled, "student")} who are not in a section. They are shared out between the new sections, so nobody is left out. Nothing is changed until
        you press Make sections.
      </p>
      <DivideFields form={form} className={className} enrolled={enrolled} classSeats={classSeats} newcomer={false} />
      <ModalError message={error} />
    </AppModal>
  );
}
