import { LogOut } from "lucide-react";
import { useUpdateTeacherMutation } from "../../redux/api/timetableApi";
import type { Teacher } from "../../types";
import { ConfirmModal } from "../classes/ConfirmModal";
import { useToast } from "../ui/toast-context";

/** "Has left?": the teacher is made inactive after a question (never deleted: old timetables say who taught), and their login closes with it. */
export function LeaveTeacherModal({ teacher, onClose }: { teacher: Teacher; onClose: () => void }) {
  const [update] = useUpdateTeacherMutation();
  const { push } = useToast();
  return (
    <ConfirmModal
      title={`${teacher.name} has left?`}
      confirmLabel="Yes, they have left"
      icon={LogOut}
      tone="primary"
      onClose={onClose}
      onConfirm={async () => {
        await update({ id: teacher.id, isActive: false }).unwrap();
        push("success", `${teacher.name} is marked as left`);
      }}
    >
      <p>
        They leave the lists you pick from{teacher.login ? " and cannot sign in any more" : ""}. Nothing is deleted: old timetables still say who taught, and you can bring them back.
      </p>
    </ConfirmModal>
  );
}
