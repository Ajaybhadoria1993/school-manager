import { useMemo, useState } from "react";
import { IndianRupee } from "lucide-react";
import { APPLIES, FREQUENCIES } from "../../constants/fees";
import { useCreateFeeLinesMutation, useUpdateFeeLineMutation } from "../../redux/api/feesApi";
import type { AppliesTo, FeeFrequency, FeeHead, FeeLine } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { defaultMonths, fieldErrorsOf, monthsProblem, sumWords } from "../../utils/fees";
import { AppModal, ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { ChipPicker } from "../ui/ChipPicker";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Switch } from "../ui/Switch";
import { useToast } from "../ui/toast-context";
import { ClassChecks, MonthChips } from "./FeeBits";

interface Form {
  headId: string;
  classIds: string[];
  amount: string;
  frequency: FeeFrequency;
  dueMonths: number[];
  appliesTo: AppliesTo;
  optional: boolean;
  notes: string;
}

/**
 * Add a fee to the fee chart of one class or of many at once, or change one line of a class. The fee comes from the school's list
 * (picking it fills in how often and who pays, as the school usually has it); the amount is for ONE instalment, and the sum under it says
 * what a year comes to. A repeating fee asks the months it falls due in (a school that does not take May and June ticks 10).
 */
export function FeeLineDialog({
  heads,
  classes,
  startMonth,
  yearId,
  presetClassId,
  line,
  classLabel,
  onClose,
}: {
  /** The fees of the school that are switched on (the Add fee list). */
  heads: FeeHead[];
  classes: { id: string; name: string }[];
  /** The month the session starts in (1 = January). */
  startMonth: number;
  yearId?: string;
  presetClassId?: string;
  /** Changing a line: its class's name is shown, the fee and the class cannot be changed. */
  line?: FeeLine;
  /** The name of the class a line belongs to, said in the title when changing it. */
  classLabel?: string;
  onClose: () => void;
}) {
  const usable = useMemo(() => heads.filter((h) => h.kind !== "transport"), [heads]);
  const [form, setForm] = useState<Form>(() =>
    line
      ? { headId: line.headId, classIds: [], amount: String(line.amount), frequency: line.frequency, dueMonths: line.dueMonths, appliesTo: line.appliesTo, optional: line.optional, notes: line.notes ?? "" }
      : { headId: "", classIds: presetClassId ? [presetClassId] : [], amount: "", frequency: "yearly", dueMonths: defaultMonths("yearly", startMonth), appliesTo: "all", optional: false, notes: "" }
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [create, creating] = useCreateFeeLinesMutation();
  const [update, updating] = useUpdateFeeLineMutation();
  const { push } = useToast();
  const busy = creating.isLoading || updating.isLoading;
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const pickHead = (id: string) => {
    const head = heads.find((h) => h.id === id);
    if (!head) return set("headId", id);
    setForm((f) => ({ ...f, headId: id, frequency: head.defaultFrequency, dueMonths: defaultMonths(head.defaultFrequency, startMonth), appliesTo: head.defaultAppliesTo, optional: head.defaultOptional }));
  };
  const pickFrequency = (frequency: FeeFrequency) =>
    // A one-time fee is for new students; leaving one-time gives "every student" back.
    setForm((f) => ({ ...f, frequency, dueMonths: defaultMonths(frequency, startMonth), appliesTo: frequency === "one_time" ? "new" : f.frequency === "one_time" ? "all" : f.appliesTo }));

  const amount = Number(form.amount);
  const sum = sumWords(amount, form.frequency, form.dueMonths);

  async function save() {
    setProblem(null);
    const local: Record<string, string> = {};
    if (!line && !form.headId) local.headId = "Choose the fee";
    if (!line && form.classIds.length === 0) local.classIds = "Choose at least one class";
    if (!(amount > 0)) local.amount = "Enter an amount above 0";
    else if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) local.amount = "Use at most two decimals (paise)";
    const months = monthsProblem(form.frequency, form.dueMonths);
    if (months) local.dueMonths = months;
    setErrors(local);
    if (Object.keys(local).length > 0) return;
    try {
      const shared = { amount, frequency: form.frequency, dueMonths: form.frequency === "one_time" ? [] : form.dueMonths, appliesTo: form.appliesTo, optional: form.optional };
      if (line) await update({ id: line.id, body: { ...shared, notes: form.notes.trim() || null } }).unwrap();
      else await create({ ...shared, yearId, classIds: form.classIds, headId: form.headId, notes: form.notes.trim() || undefined }).unwrap();
      push("success", line ? "Fee saved" : form.classIds.length > 1 ? `Fee added to ${form.classIds.length} classes` : "Fee added");
      onClose();
    } catch (err) {
      setErrors(fieldErrorsOf(err, getApiError));
      setProblem(getApiError(err)?.message ?? "Could not save. Please try again.");
    }
  }

  const headName = line ? line.headName : "";
  return (
    <AppModal
      title={line ? `Change ${headName}${classLabel ? ` (${classLabel})` : ""}` : "Add fee"}
      icon={IndianRupee}
      size="lg"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={busy}>
            {line ? "Save" : "Add fee"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!line && (
          <Field id="fee-head" label="Fee" error={errors.headId}>
            <Select id="fee-head" value={form.headId} onChange={pickHead} placeholder="Choose the fee" options={usable.map((h) => ({ value: h.id, label: h.name }))} />
          </Field>
        )}
        {!line && (
          <Field id="fee-classes" label="Classes" error={errors.classIds}>
            <ClassChecks classes={classes} picked={form.classIds} onChange={(ids) => set("classIds", ids)} label="Classes" />
          </Field>
        )}
        <Field id="fee-amount" label="Amount for one time it is charged" error={errors.amount}>
          <Input id="fee-amount" type="number" inputMode="decimal" min={0} prefix="₹" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="1200" />
        </Field>
        <Field id="fee-frequency" label="How often" error={errors.frequency}>
          <ChipPicker label="How often" value={form.frequency} onChange={(v) => pickFrequency(v as FeeFrequency)} options={FREQUENCIES} />
        </Field>
        {form.frequency !== "one_time" && (
          <Field id="fee-months" label="Months it is charged in" error={errors.dueMonths}>
            <MonthChips startMonth={startMonth} picked={form.dueMonths} onChange={(m) => set("dueMonths", m)} label="Months it is charged in" />
          </Field>
        )}
        {sum && (
          <p aria-live="polite" className="rounded-xl bg-primary-soft px-3 py-2 text-sm font-semibold text-primary-deep">
            {sum}
          </p>
        )}
        <Field id="fee-applies" label="Who pays it" error={errors.appliesTo}>
          {form.frequency === "one_time" ? (
            <p className="text-sm text-foreground-muted">New students only: a one-time fee is paid when the child joins.</p>
          ) : (
            <ChipPicker label="Who pays it" value={form.appliesTo} onChange={(v) => set("appliesTo", v as AppliesTo)} options={APPLIES} />
          )}
        </Field>
        <Switch checked={form.optional} onChange={(on) => set("optional", on)} hint="The family chooses it, like a uniform or the bus. It is not added to the fee the child must pay.">
          Optional
        </Switch>
        <Field id="fee-notes" label="Note" optional error={errors.notes}>
          <Input id="fee-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={200} placeholder="Term 1 and Term 2" />
        </Field>
      </div>
      <ModalError message={problem} />
    </AppModal>
  );
}
