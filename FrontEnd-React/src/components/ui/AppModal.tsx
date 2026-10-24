import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Alert, Modal } from "@heroui/react";

/**
 * The frame of every dialog of the signed-in app (HeroUI Modal, so it covers the whole screen and traps focus).
 * Pass the form as children and the buttons as `footer`. While `busy` it cannot be closed by accident.
 * Mount it fresh each time it opens (render it only while it is wanted), so a form always starts empty.
 */
export function AppModal({
  title,
  icon: Icon,
  tone = "primary",
  busy = false,
  size = "md",
  onClose,
  children,
  footer,
}: {
  title: string;
  icon: LucideIcon;
  /** "danger" for a dialog that deletes something. */
  tone?: "primary" | "danger";
  busy?: boolean;
  /** "cover": the whole screen (a wide table, such as the Excel preview). */
  size?: "sm" | "md" | "lg" | "cover";
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  // No <Modal> root and no trigger: this dialog is opened by the page (it is rendered only while wanted), and HeroUI's
  // root would wait for a trigger button to press and warn in the console when it finds none.
  return (
    <Modal.Backdrop
      variant="blur"
      isOpen
      isDismissable={!busy}
      isKeyboardDismissDisabled={busy}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <Modal.Container size={size}>
        <Modal.Dialog aria-label={title}>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Icon className={tone === "danger" ? "bg-danger-soft text-danger" : "bg-primary-soft text-primary"}>
              <Icon className="size-5" aria-hidden />
            </Modal.Icon>
            <Modal.Heading>{title}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="space-y-4">{children}</Modal.Body>
          {footer && <Modal.Footer>{footer}</Modal.Footer>}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

/** The red note under a form when the server said no. */
export function ModalError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>{message}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
