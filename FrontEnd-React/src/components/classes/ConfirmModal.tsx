import type { ReactNode } from "react";
import { Trash2, type LucideIcon } from "lucide-react";
import { Button } from "@heroui/react";
import { AppModal, ModalError } from "../ui/AppModal";
import { useSave } from "./useSave";

/**
 * "Are you sure?" for something that is hard to undo. `onConfirm` does the request; if it fails the reason is shown here. Red and a bin
 * by default (a deletion); `tone="primary"` and an `icon` of its own for a change that is not a deletion.
 */
export function ConfirmModal({
  title,
  confirmLabel,
  onConfirm,
  onClose,
  icon = Trash2,
  tone = "danger",
  children,
}: {
  title: string;
  confirmLabel: string;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
  icon?: LucideIcon;
  tone?: "primary" | "danger";
  children: ReactNode;
}) {
  const { busy, error, run } = useSave(onClose);

  return (
    <AppModal
      title={title}
      icon={icon}
      tone={tone}
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onPress={onClose} isDisabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} isPending={busy} onPress={() => run(onConfirm)}>
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
