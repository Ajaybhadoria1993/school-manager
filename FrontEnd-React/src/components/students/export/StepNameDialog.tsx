import { useState } from "react";
import { ListPlus, PencilLine } from "lucide-react";
import { MAX_STEP_NAME, type StepDef } from "../../../constants/studentFields";
import { stepNameProblem } from "../../../utils/exportLayout";
import { AppModal } from "../../ui/AppModal";
import { Button } from "../../ui/Button";
import { Field } from "../../ui/Field";
import { Input } from "../../ui/Input";

/**
 * The name of a step of the school's own: a new one ("Add a step") or the one being renamed (`step`). Checked with the server's words
 * (2 to 30 characters, no < >, not the name of another step) before it goes to the page's draft; nothing is sent until the page's Save.
 */
export function StepNameDialog({ step, steps, onSave, onClose }: { step: StepDef | null; steps: readonly StepDef[]; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(step?.name ?? "");
  const [tried, setTried] = useState(false);
  const problem = stepNameProblem(name, steps, step?.key);
  const editing = !!step;

  function save() {
    setTried(true);
    if (!problem) onSave(name);
  }

  return (
    <AppModal
      title={editing ? `Rename ${step.name}` : "Add a step"}
      icon={editing ? PencilLine : ListPlus}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{editing ? "Keep the name" : "Add the step"}</Button>
        </>
      }
    >
      <Field id="step-name" label="Name of the step" hint="As Add student's stepper shows it, for example Health or Documents. It is shown only when something is asked in it." error={tried ? problem : undefined}>
        <Input
          id="step-name"
          value={name}
          maxLength={MAX_STEP_NAME + 5}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          aria-invalid={tried && !!problem}
        />
      </Field>
    </AppModal>
  );
}
