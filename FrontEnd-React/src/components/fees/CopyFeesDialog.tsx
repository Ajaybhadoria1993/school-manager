import { useState } from "react";
import { Copy } from "lucide-react";
import { RAISE_NEEDS_APPROVAL_ABOVE } from "../../constants/fees";
import { useCopyFeesFromLastYearMutation, useCopyFeesToClassesMutation } from "../../redux/api/feesApi";
import { getApiError } from "../../utils/apiErrors";
import { fieldErrorsOf, raiseNote } from "../../utils/fees";
import { AppModal, ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { ChipPicker } from "../ui/ChipPicker";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Switch } from "../ui/Switch";
import { useToast } from "../ui/toast-context";
import { ClassChecks } from "./FeeBits";

type Mode = "classes" | "year";

/**
 * Two ways to save typing: give other classes the fee chart of one class (Classes 6, 7 and 8 often pay the same), or start this session's
 * chart from the session before it with every amount raised by a percentage. Nothing a class already has is changed unless "replace" is on.
 */
export function CopyFeesDialog({
  mode: first,
  classes,
  fromClassId,
  yearId,
  yearName,
  onClose,
}: {
  mode: Mode;
  /** Every class of the school, with how many fees it has. */
  classes: { id: string; name: string; fees: number }[];
  fromClassId?: string;
  yearId?: string;
  yearName: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>(first);
  const withFees = classes.filter((c) => c.fees > 0);
  const [from, setFrom] = useState(fromClassId && withFees.some((c) => c.id === fromClassId) ? fromClassId : (withFees[0]?.id ?? ""));
  const [to, setTo] = useState<string[]>([]);
  const [replace, setReplace] = useState(false);
  const [raise, setRaise] = useState("0");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [copyClass, copyingClass] = useCopyFeesToClassesMutation();
  const [copyYear, copyingYear] = useCopyFeesFromLastYearMutation();
  const { push } = useToast();
  const busy = copyingClass.isLoading || copyingYear.isLoading;
  const percent = Number(raise);

  async function save() {
    setProblem(null);
    const local: Record<string, string> = {};
    if (mode === "classes") {
      if (!from) local.fromClassId = "Choose the class to copy from";
      if (to.length === 0) local.toClassIds = "Choose at least one class";
    } else if (!Number.isFinite(percent) || percent < 0 || percent > 100) local.raisePercent = "Enter a percentage from 0 to 100";
    setErrors(local);
    if (Object.keys(local).length > 0) return;
    try {
      if (mode === "classes") {
        const res = (await copyClass({ yearId, fromClassId: from, toClassIds: to, replace }).unwrap()).data;
        push("success", `${res.added} added${res.replaced ? `, ${res.replaced} changed` : ""}${res.skipped ? `, ${res.skipped} kept as they were` : ""}`);
      } else {
        const res = (await copyYear({ yearId, raisePercent: percent }).unwrap()).data;
        push("success", `${res.added} fees copied from ${res.from}${res.skipped ? `, ${res.skipped} already there` : ""}`);
      }
      onClose();
    } catch (err) {
      setErrors(fieldErrorsOf(err, getApiError));
      setProblem(getApiError(err)?.message ?? "Could not copy the fees. Please try again.");
    }
  }

  const note = raiseNote(percent, RAISE_NEEDS_APPROVAL_ABOVE);
  return (
    <AppModal
      title="Copy fees"
      icon={Copy}
      size="lg"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={busy}>
            Copy
          </Button>
        </>
      }
    >
      <ChipPicker
        label="Copy from"
        value={mode}
        onChange={(v) => {
          setMode(v as Mode);
          setErrors({});
          setProblem(null);
        }}
        options={[
          { value: "classes", label: "One class to other classes" },
          { value: "year", label: "Last session's fees" },
        ]}
      />
      {mode === "classes" ? (
        <div className="space-y-4">
          <Field id="copy-from" label="Copy the fees of" error={errors.fromClassId}>
            <Select id="copy-from" value={from} onChange={(v) => { setFrom(v); setTo((t) => t.filter((id) => id !== v)); }} placeholder="Choose a class" options={withFees.map((c) => ({ value: c.id, label: `${c.name} (${c.fees} ${c.fees === 1 ? "fee" : "fees"})` }))} />
          </Field>
          <Field id="copy-to" label="to these classes" error={errors.toClassIds}>
            <ClassChecks classes={classes.filter((c) => c.id !== from)} picked={to} onChange={setTo} label="Classes to copy to" />
          </Field>
          <Switch checked={replace} onChange={setReplace} hint="A fee a class already has takes this class's amount. Off: it stays as it is.">
            Replace fees the classes already have
          </Switch>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-foreground-muted">Fills {yearName} with the fees of the session before it. A fee a class already has is kept.</p>
          <Field id="copy-raise" label="Raise every amount by (%)" error={errors.raisePercent}>
            <Input id="copy-raise" type="number" inputMode="decimal" min={0} max={100} step="0.5" value={raise} onChange={(e) => setRaise(e.target.value)} placeholder="0" />
          </Field>
          {note && <p className="rounded-xl bg-warning-soft px-3 py-2 text-sm font-medium text-warning">{note}</p>}
        </div>
      )}
      <ModalError message={problem} />
    </AppModal>
  );
}
