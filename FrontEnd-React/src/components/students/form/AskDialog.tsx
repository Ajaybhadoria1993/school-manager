import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@heroui/react";
import { AppModal } from "../../ui/AppModal";

/**
 * "Are you sure?" for a choice that is not a deletion: a full section, a possible duplicate. Cancel changes nothing; the confirm
 * button does what it says (the page sends the request again with the person's answer).
 */
export function AskDialog({
  title,
  icon,
  confirmLabel,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  icon: LucideIcon;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <AppModal
      title={title}
      icon={icon}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onPress={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onPress={() => {
              onClose();
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-2 text-sm text-foreground-muted">{children}</div>
    </AppModal>
  );
}
