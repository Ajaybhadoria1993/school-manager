import { useState } from "react";
import { Tags } from "lucide-react";
import { APPLIES, FEE_KINDS, FREQUENCIES, USUAL_FEES } from "../../constants/fees";
import { useCreateFeeHeadMutation, useUpdateFeeHeadMutation } from "../../redux/api/feesApi";
import type { AppliesTo, FeeFrequency, FeeHead, FeeKind } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { fieldErrorsOf } from "../../utils/fees";
import { AppModal, ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Switch } from "../ui/Switch";
import { useToast } from "../ui/toast-context";

interface Form {
  name: string;
  kind: FeeKind | "";
  refundable: boolean;
  defaultFrequency: FeeFrequency;
  defaultAppliesTo: AppliesTo;
  defaultOptional: boolean;
  notes: string;
  isActive: boolean;
}

const bodyOf = (h: FeeHead): Form => ({
  name: h.name,
  kind: h.kind,
  refundable: h.refundable,
  defaultFrequency: h.defaultFrequency,
  defaultAppliesTo: h.defaultAppliesTo,
  defaultOptional: h.defaultOptional,
  notes: h.notes ?? "",
  isActive: h.isActive,
});

/**
 * Add a fee to the school's list (Tuition, Admission, Exam, Uniform...), or change one. A new fee can start from a usual one (its kind,
 * how often and who pays are filled in); the three "usually" boxes only save typing on Add fee, each class's line keeps its own.
 */
export function FeeHeadDialog({ head, onClose }: { head?: FeeHead; onClose: () => void }) {
  const [form, setForm] = useState<Form>(() => (head ? bodyOf(head) : { name: "", kind: "", refundable: false, defaultFrequency: "yearly", defaultAppliesTo: "all", defaultOptional: false, notes: "", isActive: true }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [create, creating] = useCreateFeeHeadMutation();
  const [update, updating] = useUpdateFeeHeadMutation();
  const { push } = useToast();
  const busy = creating.isLoading || updating.isLoading;
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const startFrom = (name: string) => {
    const usual = USUAL_FEES.find((u) => u.name === name);
    if (usual) setForm((f) => ({ ...f, name: usual.name, kind: usual.kind, refundable: !!usual.refundable, defaultFrequency: usual.frequency, defaultAppliesTo: usual.appliesTo, defaultOptional: usual.optional }));
  };
  const pickFrequency = (frequency: FeeFrequency) => setForm((f) => ({ ...f, defaultFrequency: frequency, defaultAppliesTo: frequency === "one_time" ? "new" : f.defaultFrequency === "one_time" ? "all" : f.defaultAppliesTo }));

  async function save() {
    setProblem(null);
    const local: Record<string, string> = {};
    if (!form.name.trim()) local.name = "Enter the name of the fee";
    if (!form.kind) local.kind = "Choose what the fee is about";
    setErrors(local);
    if (Object.keys(local).length > 0 || !form.kind) return;
    try {
      const body = { name: form.name.trim(), kind: form.kind, refundable: form.refundable, defaultFrequency: form.defaultFrequency, defaultAppliesTo: form.defaultAppliesTo, defaultOptional: form.defaultOptional, notes: form.notes.trim() };
      if (head) await update({ id: head.id, body: { ...body, isActive: form.isActive } }).unwrap();
      else await create(body).unwrap();
      push("success", head ? "Fee saved" : "Fee added");
      onClose();
    } catch (err) {
      setErrors(fieldErrorsOf(err, getApiError));
      setProblem(getApiError(err)?.message ?? "Could not save. Please try again.");
    }
  }

  return (
    <AppModal
      title={head ? `Change ${head.name}` : "Add a fee"}
      icon={Tags}
      size="lg"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={busy}>
            {head ? "Save" : "Add fee"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!head && (
          <Field id="head-usual" label="Start from a usual fee" optional className="sm:col-span-2">
            <Select id="head-usual" value="" onChange={startFrom} placeholder="Pick one, or type your own below" options={USUAL_FEES.map((u) => u.name)} />
          </Field>
        )}
        <Field id="head-name" label="Name of the fee" error={errors.name}>
          <Input id="head-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Tuition fee" maxLength={60} />
        </Field>
        <Field id="head-kind" label="What it is about" error={errors.kind}>
          <Select id="head-kind" value={form.kind} onChange={(v) => set("kind", v as FeeKind)} placeholder="Choose" options={FEE_KINDS} />
        </Field>
        <Field id="head-frequency" label="Usually charged" error={errors.defaultFrequency}>
          <Select id="head-frequency" value={form.defaultFrequency} onChange={(v) => pickFrequency(v as FeeFrequency)} options={FREQUENCIES} />
        </Field>
        <Field id="head-applies" label="Usually paid by" error={errors.defaultAppliesTo}>
          {form.defaultFrequency === "one_time" ? (
            <p className="flex h-11 items-center text-sm text-foreground-muted">New students only</p>
          ) : (
            <Select id="head-applies" value={form.defaultAppliesTo} onChange={(v) => set("defaultAppliesTo", v as AppliesTo)} options={APPLIES} />
          )}
        </Field>
        <Field id="head-notes" label="Note" optional error={errors.notes} className="sm:col-span-2">
          <Input id="head-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={200} />
        </Field>
      </div>
      <Switch checked={form.defaultOptional} onChange={(on) => set("defaultOptional", on)}>
        Usually optional (the family chooses it)
      </Switch>
      <Switch checked={form.refundable} onChange={(on) => set("refundable", on)}>
        Given back when the child leaves
      </Switch>
      {head && (
        <Switch checked={form.isActive} onChange={(on) => set("isActive", on)}>
          In use (switch off when the school stops charging it)
        </Switch>
      )}
      <ModalError message={problem} />
    </AppModal>
  );
}
