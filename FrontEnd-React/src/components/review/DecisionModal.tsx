import { useState, type ComponentType } from "react";
import { Power, PowerOff, ThumbsDown, ThumbsUp } from "lucide-react";
import { Alert, Button, Modal } from "@heroui/react";
import { Field } from "../ui/Field";
import { Textarea } from "../ui/Input";

export type DecisionKind = "approve" | "reject" | "suspend" | "reactivate";

interface KindCopy {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** Colours of the icon badge and of the confirm button. */
  good: boolean;
  title: (school: string) => string;
  intro: string;
  label: string;
  hint: string;
  placeholder: string;
  /** Shown when a required text is too short. */
  tooShort: string;
  confirm: string;
  /** The text is a note for the platform team (optional) or a reason the school will read (needed). */
  optional: boolean;
  /** Common reasons: one click adds the sentence, which the reviewer can then edit. */
  quick: string[];
}

const MIN_REASON = 10;

const KINDS: Record<DecisionKind, KindCopy> = {
  approve: {
    icon: ThumbsUp,
    good: true,
    title: (school) => `Approve ${school}?`,
    intro: "The administrator can open the dashboard straight away, and gets an email saying so.",
    label: "Note for your records",
    hint: "Only you and other platform admins see this.",
    placeholder: "For example, documents checked by phone.",
    tooShort: "",
    confirm: "Approve",
    optional: true,
    quick: [],
  },
  reject: {
    icon: ThumbsDown,
    good: false,
    title: (school) => `Send ${school} back?`,
    intro: "The school sees your reason, can fix its details and submit again. Nothing they entered is lost.",
    label: "What needs to change?",
    hint: "Be specific, for example which field is wrong.",
    placeholder: "The UDISE+ code does not match the registration certificate.",
    tooShort: `Tell the school what to fix (at least ${MIN_REASON} characters).`,
    confirm: "Send back",
    optional: false,
    quick: [
      "The UDISE+ code does not match the school's registration.",
      "Please add the affiliation number for each board.",
      "The address is incomplete. Please add the area and the district.",
      "We could not reach the school on the phone numbers given.",
    ],
  },
  suspend: {
    icon: PowerOff,
    good: false,
    title: (school) => `Suspend ${school}?`,
    intro:
      "Everyone at the school is signed out now and cannot sign in until you reactivate it. Nothing is deleted. The administrator gets an email with your reason.",
    label: "Why are you suspending it?",
    hint: "The administrator reads this, so keep it clear and polite.",
    placeholder: "The yearly subscription fee is overdue. Please contact the platform team.",
    tooShort: `Tell the school why (at least ${MIN_REASON} characters).`,
    confirm: "Suspend school",
    optional: false,
    quick: [
      "The subscription fee is overdue.",
      "The school asked us to pause its account.",
      "We are looking into a complaint about this school.",
      "The registration details turned out to be incorrect.",
    ],
  },
  reactivate: {
    icon: Power,
    good: true,
    title: (school) => `Reactivate ${school}?`,
    intro: "Everyone at the school can sign in again (they sign in afresh), and the administrator gets an email saying so.",
    label: "Note for your records",
    hint: "Only you and other platform admins see this.",
    placeholder: "For example, the fee was received.",
    tooShort: "",
    confirm: "Reactivate",
    optional: true,
    quick: [],
  },
};


/**
 * Asks for the decision's note (optional) or reason (needed, and the school reads it).
 * Open it fresh each time (give it a new `key`) so it starts empty.
 */
export function DecisionModal({
  kind,
  open,
  schoolName,
  working,
  error,
  onClose,
  onConfirm,
}: {
  kind: DecisionKind;
  open: boolean;
  schoolName: string;
  working: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [tooShort, setTooShort] = useState(false);
  const copy = KINDS[kind];
  const Icon = copy.icon;

  function submit() {
    if (!copy.optional && text.trim().length < MIN_REASON) {
      setTooShort(true);
      return;
    }
    onConfirm(text.trim());
  }

  return (
    <Modal>
      <Modal.Backdrop
        variant="blur"
        isOpen={open}
        isDismissable={!working}
        isKeyboardDismissDisabled={working}
        onOpenChange={(next) => {
          if (!next && !working) onClose();
        }}
      >
        <Modal.Container size="md">
          <Modal.Dialog aria-label={copy.title(schoolName)}>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Icon className={copy.good ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}>
                <Icon className="size-5" aria-hidden />
              </Modal.Icon>
              <Modal.Heading>{copy.title(schoolName)}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="space-y-4">
              <p className="text-sm text-foreground-muted">{copy.intro}</p>

              {copy.quick.length > 0 && (
                <div className="flex flex-wrap gap-2" aria-label="Quick reasons">
                  {copy.quick.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => {
                        setText((current) => (current.trim() ? `${current.trimEnd()} ${reason}` : reason).slice(0, 500));
                        setTooShort(false);
                      }}
                      className="rounded-full border border-border bg-surface px-3 py-1 text-left text-xs font-medium text-foreground-muted transition-colors hover:border-primary/40 hover:bg-primary-soft hover:text-primary"
                    >
                      + {reason}
                    </button>
                  ))}
                </div>
              )}

              <Field
                id="decision-text"
                label={copy.label}
                optional={copy.optional}
                hint={copy.hint}
                error={tooShort && text.trim().length < MIN_REASON ? copy.tooShort : undefined}
              >
                <Textarea
                  id="decision-text"
                  rows={4}
                  value={text}
                  maxLength={500}
                  autoFocus
                  placeholder={copy.placeholder}
                  onChange={(e) => {
                    setText(e.target.value);
                    setTooShort(false);
                  }}
                />
              </Field>
              <p className="-mt-2 text-right text-xs text-foreground-muted">{text.length}/500</p>

              {error && (
                <Alert status="danger">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{error}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="secondary" onPress={onClose} isDisabled={working}>
                Cancel
              </Button>
              <Button variant={copy.good ? "primary" : "danger"} onPress={submit} isPending={working}>
                {copy.confirm}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
