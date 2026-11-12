import { useState } from "react";
import { BadgePercent } from "lucide-react";
import { CONCESSION_BASES, USUAL_CONCESSIONS } from "../../constants/fees";
import { useCreateConcessionMutation, useUpdateConcessionMutation } from "../../redux/api/feesApi";
import type { Concession, ConcessionBasis, ConcessionMode, FeeHead } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { fieldErrorsOf } from "../../utils/fees";
import { AppModal, ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { ChipPicker } from "../ui/ChipPicker";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Switch } from "../ui/Switch";
import { useToast } from "../ui/toast-context";

interface Form {
  name: string;
  basis: ConcessionBasis | "";
  mode: ConcessionMode;
  value: string;
  appliesTo: "all" | "selected";
  headIds: string[];
  needsApproval: boolean;
  notes: string;
  isActive: boolean;
}

/**
 * Add a concession the school gives, or change one: why (sibling, staff child, RTE...), a percentage or an amount, and which fees it takes
 * off (every fee, or the ones ticked). A new one can start from a usual concession; it then takes off the school's fees of the kind that
 * concession usually is about (tuition, admission), when the school has them. Giving it to a student comes with collecting fees.
 */
export function ConcessionDialog({ concession, heads, onClose }: { concession?: Concession; heads: FeeHead[]; onClose: () => void }) {
  const [form, setForm] = useState<Form>(() =>
    concession
      ? { name: concession.name, basis: concession.basis, mode: concession.mode, value: String(concession.value), appliesTo: concession.appliesTo, headIds: concession.headIds, needsApproval: concession.needsApproval, notes: concession.notes ?? "", isActive: concession.isActive }
      : { name: "", basis: "", mode: "percent", value: "", appliesTo: "all", headIds: [], needsApproval: true, notes: "", isActive: true }
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [create, creating] = useCreateConcessionMutation();
  const [update, updating] = useUpdateConcessionMutation();
  const { push } = useToast();
  const busy = creating.isLoading || updating.isLoading;
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const startFrom = (name: string) => {
    const usual = USUAL_CONCESSIONS.find((u) => u.name === name);
    if (!usual) return;
    const ids = heads.filter((h) => usual.onKinds.includes(h.kind)).map((h) => h.id);
    setForm((f) => ({ ...f, name: usual.name, basis: usual.basis, mode: usual.mode, value: String(usual.value), appliesTo: ids.length > 0 ? "selected" : "all", headIds: ids, needsApproval: usual.needsApproval }));
  };
  const toggleHead = (id: string) => set("headIds", form.headIds.includes(id) ? form.headIds.filter((x) => x !== id) : [...form.headIds, id]);

  async function save() {
    setProblem(null);
    const value = Number(form.value);
    const local: Record<string, string> = {};
    if (!form.name.trim()) local.name = "Enter the name of the concession";
    if (!form.basis) local.basis = "Choose why it is given";
    if (!(value > 0)) local.value = "Enter a value above 0";
    else if (form.mode === "percent" && value > 100) local.value = "A percentage cannot be more than 100";
    if (form.appliesTo === "selected" && form.headIds.length === 0) local.headIds = "Choose the fees it takes off";
    setErrors(local);
    if (Object.keys(local).length > 0 || !form.basis) return;
    try {
      const body = { name: form.name.trim(), basis: form.basis, mode: form.mode, value, appliesTo: form.appliesTo, headIds: form.appliesTo === "selected" ? form.headIds : [], needsApproval: form.needsApproval, notes: form.notes.trim() };
      if (concession) await update({ id: concession.id, body: { ...body, isActive: form.isActive } }).unwrap();
      else await create(body).unwrap();
      push("success", concession ? "Concession saved" : "Concession added");
      onClose();
    } catch (err) {
      setErrors(fieldErrorsOf(err, getApiError));
      setProblem(getApiError(err)?.message ?? "Could not save. Please try again.");
    }
  }

  return (
    <AppModal
      title={concession ? `Change ${concession.name}` : "Add a concession"}
      icon={BadgePercent}
      size="lg"
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={busy}>
            {concession ? "Save" : "Add concession"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {!concession && (
          <Field id="con-usual" label="Start from a usual concession" optional className="sm:col-span-2">
            <Select id="con-usual" value="" onChange={startFrom} placeholder="Pick one, or fill it in below" options={USUAL_CONCESSIONS.map((u) => u.name)} />
          </Field>
        )}
        <Field id="con-name" label="Name" error={errors.name}>
          <Input id="con-name" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Sibling concession" maxLength={60} />
        </Field>
        <Field id="con-basis" label="Given because" error={errors.basis}>
          <Select id="con-basis" value={form.basis} onChange={(v) => set("basis", v as ConcessionBasis)} placeholder="Choose" options={CONCESSION_BASES} />
        </Field>
        <Field id="con-mode" label="Takes off">
          <ChipPicker label="Takes off" value={form.mode} onChange={(v) => set("mode", v as ConcessionMode)} options={[{ value: "percent", label: "A percentage" }, { value: "flat", label: "An amount" }]} />
        </Field>
        <Field id="con-value" label={form.mode === "percent" ? "Percentage" : "Amount for the session"} error={errors.value}>
          <Input id="con-value" type="number" inputMode="decimal" min={0} prefix={form.mode === "percent" ? "%" : "₹"} value={form.value} onChange={(e) => set("value", e.target.value)} placeholder={form.mode === "percent" ? "10" : "5000"} />
        </Field>
        <Field id="con-applies" label="Takes it off" className="sm:col-span-2" error={errors.headIds}>
          <ChipPicker label="Takes it off" value={form.appliesTo} onChange={(v) => set("appliesTo", v as "all" | "selected")} options={[{ value: "all", label: "Every fee" }, { value: "selected", label: "Only some fees" }]} />
          {form.appliesTo === "selected" && (
            <ul aria-label="Fees it takes off" className="mt-2 grid max-h-44 gap-1.5 overflow-y-auto rounded-xl border border-border p-2 sm:grid-cols-2">
              {heads.length === 0 ? (
                <li className="px-2 py-1 text-sm text-foreground-muted">Add fees to your list first.</li>
              ) : (
                heads.map((h) => (
                  <li key={h.id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-surface-muted">
                      <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={form.headIds.includes(h.id)} onChange={() => toggleHead(h.id)} />
                      {h.name}
                    </label>
                  </li>
                ))
              )}
            </ul>
          )}
        </Field>
        <Field id="con-notes" label="Note" optional className="sm:col-span-2" error={errors.notes}>
          <Input id="con-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={200} placeholder="From the second child" />
        </Field>
      </div>
      <Switch checked={form.needsApproval} onChange={(on) => set("needsApproval", on)} hint="The principal or the school admin agrees before it is given to a student.">
        Needs approval
      </Switch>
      {concession && (
        <Switch checked={form.isActive} onChange={(on) => set("isActive", on)}>
          In use
        </Switch>
      )}
      <ModalError message={problem} />
    </AppModal>
  );
}
