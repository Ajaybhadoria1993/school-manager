import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@heroui/react";
import { AppModal, ModalError } from "../ui/AppModal";
import { useSave } from "./useSave";

/** "Are you sure?" for something that cannot be undone. `onConfirm` does the request; if it fails the reason is shown here. */
export function ConfirmModal({
  title,
  confirmLabel,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  confirmLabel: string;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
  children: ReactNode;
}) {
  const { busy, error, run } = useSave(onClose);

  return (
    <AppModal
      title={title}
      icon={Trash2}
      tone="danger"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onPress={onClose} isDisabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" isPending={busy} onPress={() => run(onConfirm)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-sm text-foreground-muted">{children}</div>
      <ModalError message={error?.message ?? null} />
    </AppModal>
  );
}
