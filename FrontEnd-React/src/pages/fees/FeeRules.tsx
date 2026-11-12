import { useState } from "react";
import { Save } from "lucide-react";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ChipPicker } from "../../components/ui/ChipPicker";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { Skeleton } from "../../components/ui/Skeleton";
import { Switch } from "../../components/ui/Switch";
import { useToast } from "../../components/ui/toast-context";
import { LATE_FINE_MODES } from "../../constants/fees";
import { useCan } from "../../hooks/useCan";
import { useGetFeeRulesQuery, useSaveFeeRulesMutation } from "../../redux/api/feesApi";
import type { FeeRules, LateFineMode, SavedFeeRules } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { fieldErrorsOf } from "../../utils/fees";

interface Draft {
  dueDay: string;
  graceDays: string;
  mode: LateFineMode;
  amount: string;
  maxAmount: string;
  allowPartial: boolean;
  holdReportCard: boolean;
  holdCertificate: boolean;
}

const draftOf = (r: FeeRules): Draft => ({
  dueDay: String(r.dueDay),
  graceDays: String(r.graceDays),
  mode: r.lateFine.mode,
  amount: r.lateFine.mode === "none" ? "" : String(r.lateFine.amount),
  maxAmount: r.lateFine.maxAmount === null ? "" : String(r.lateFine.maxAmount),
  allowPartial: r.allowPartial,
  holdReportCard: r.holdReportCard,
  holdCertificate: r.holdCertificate,
});

function RulesForm({ saved, mayChange }: { saved: SavedFeeRules; mayChange: boolean }) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(saved));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [save, saving] = useSaveFeeRulesMutation();
  const { push } = useToast();
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(saved));

  async function submit() {
    setProblem(null);
    const dueDay = Number(draft.dueDay);
    const graceDays = Number(draft.graceDays);
    const amount = Number(draft.amount);
    const max = draft.maxAmount.trim() === "" ? null : Number(draft.maxAmount);
    const local: Record<string, string> = {};
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) local.dueDay = "The due day is 1 to 28";
    if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > 30) local.graceDays = "Grace is 0 to 30 days";
    if (draft.mode !== "none" && !(amount > 0)) local["lateFine.amount"] = draft.mode === "percent_per_month" ? "Enter the percentage" : "Enter the fine";
    if (draft.mode === "percent_per_month" && amount > 100) local["lateFine.amount"] = "A percentage cannot be more than 100";
    if (max !== null && !(max >= 0)) local["lateFine.maxAmount"] = "Enter the most a family pays as fine";
    setErrors(local);
    if (Object.keys(local).length > 0) return;
    try {
      await save({
        dueDay,
        graceDays,
        lateFine: draft.mode === "none" ? { mode: "none", amount: 0, maxAmount: null } : { mode: draft.mode, amount, maxAmount: draft.mode === "flat" ? null : max },
        allowPartial: draft.allowPartial,
        holdReportCard: draft.holdReportCard,
        holdCertificate: draft.holdCertificate,
      }).unwrap();
      push("success", "Fee rules saved");
    } catch (err) {
      setErrors(fieldErrorsOf(err, getApiError));
      setProblem(getApiError(err)?.message ?? "Could not save. Please try again.");
    }
  }

  const off = !mayChange;
  return (
    <Card className="space-y-6 p-5">
      <section aria-label="Due date" className="grid gap-4 sm:grid-cols-2">
        <Field id="rules-due" label="Fees are due on day" error={errors.dueDay} hint="Of each month a fee falls due in (1 to 28)">
          <Input id="rules-due" type="number" inputMode="numeric" min={1} max={28} value={draft.dueDay} disabled={off} onChange={(e) => set("dueDay", e.target.value)} />
        </Field>
        <Field id="rules-grace" label="Days of grace" error={errors.graceDays} hint="No fine for this many days after the due day">
          <Input id="rules-grace" type="number" inputMode="numeric" min={0} max={30} value={draft.graceDays} disabled={off} onChange={(e) => set("graceDays", e.target.value)} />
        </Field>
      </section>

      <section aria-label="Late fine" className="space-y-3">
        <Field id="rules-fine" label="When a fee is paid late">
          <ChipPicker label="When a fee is paid late" value={draft.mode} onChange={(v) => set("mode", v as LateFineMode)} options={LATE_FINE_MODES.map((m) => ({ ...m, disabled: off }))} />
        </Field>
        {draft.mode !== "none" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="rules-fine-amount" label={draft.mode === "percent_per_month" ? "Percentage of what is due, each month" : draft.mode === "per_day" ? "Fine for each day" : "Fine"} error={errors["lateFine.amount"]}>
              <Input id="rules-fine-amount" type="number" inputMode="decimal" min={0} prefix={draft.mode === "percent_per_month" ? "%" : "₹"} value={draft.amount} disabled={off} onChange={(e) => set("amount", e.target.value)} />
            </Field>
            {draft.mode !== "flat" && (
              <Field id="rules-fine-max" label="Most a family pays as fine" optional error={errors["lateFine.maxAmount"]}>
                <Input id="rules-fine-max" type="number" inputMode="decimal" min={0} prefix="₹" value={draft.maxAmount} disabled={off} onChange={(e) => set("maxAmount", e.target.value)} />
              </Field>
            )}
          </div>
        )}
      </section>

      <section aria-label="Until fees are paid" className="space-y-3">
        <Switch checked={draft.allowPartial} onChange={(on) => set("allowPartial", on)} disabled={off} hint="A family may pay part of an instalment now and the rest later.">
          Part payment
        </Switch>
        <Switch checked={draft.holdReportCard} onChange={(on) => set("holdReportCard", on)} disabled={off}>
          Hold the report card while fees are due
        </Switch>
        <Switch checked={draft.holdCertificate} onChange={(on) => set("holdCertificate", on)} disabled={off}>
          Hold the transfer certificate while fees are due
        </Switch>
      </section>

      {problem && <p role="alert" className="text-sm font-medium text-danger">{problem}</p>}
      {mayChange && (
        <div className="flex items-center gap-3">
          <Button onClick={() => void submit()} loading={saving.isLoading} disabled={!dirty}>
            <Save className="size-4" aria-hidden />
            Save
          </Button>
          {dirty && <span className="text-sm text-foreground-muted">Changes not saved yet</span>}
        </div>
      )}
    </Card>
  );
}

/**
 * Fees > Fee rules (`/fees/rules`): when a fee falls due in the month, how many days of grace, what a late payment costs (nothing, a flat
 * amount, an amount a day or a percentage a month, with a most), whether a family may pay in parts, and what the school holds back (the
 * report card, the transfer certificate) while fees are due. One Save.
 */
export default function FeeRulesPage() {
  const can = useCan();
  const res = useGetFeeRulesQuery();
  const saved = res.data?.data;
  return (
    <div className="space-y-6">
      <StudentFormHeader title="Fee rules" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} />
      {saved ? (
        // Remounted when the saved rules change, so the form starts from what was saved.
        <RulesForm key={JSON.stringify(saved)} saved={saved} mayChange={can("fees.manage")} />
      ) : res.error ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the fee rules."}</p>
          <Button variant="outline" onClick={() => void res.refetch()}>
            Try again
          </Button>
        </Card>
      ) : (
        <Skeleton className="h-72 rounded-2xl" />
      )}
    </div>
  );
}
