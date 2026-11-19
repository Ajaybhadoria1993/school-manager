import { useMemo, useState } from "react";
import { HandCoins } from "lucide-react";
import { PAYMENT_MODES } from "../../constants/fees";
import { useCollectFeesMutation } from "../../redux/api/feesApi";
import type { AccountCharge, FeeAccount, PaymentMode, Receipt } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { formatDay } from "../../utils/academicYear";
import { fieldErrorsOf, lateFineFor, rupees, todayInIndia } from "../../utils/fees";
import { AppModal, ModalError } from "../ui/AppModal";
import { Button } from "../ui/Button";
import { DateBox } from "../ui/DateBox";
import { Field } from "../ui/Field";
import { Input, Textarea } from "../ui/Input";
import { Select } from "../ui/Select";

const money = (text: string) => (text.trim() === "" ? NaN : Number(text));

/**
 * Take a payment for the instalments chosen: how much of each (all of it, or part when the school allows part payment), how it was paid
 * (a cheque or a draft needs its number), the day, the late fine (what the school's rules ask for is filled in; the cashier may take less,
 * never more) and a note. The server checks it all again and gives the numbered receipt.
 */
export function CollectDialog({ account, chosen, onClose, onDone }: { account: FeeAccount; chosen: AccountCharge[]; onClose: () => void; onDone: (receipt: Receipt) => void }) {
  const today = todayInIndia();
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(chosen.map((c) => [c.id, String(c.outstanding)])));
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [fineText, setFineText] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [collect, collecting] = useCollectFeesMutation();
  const needsReference = PAYMENT_MODES.find((m) => m.value === mode)!.needsReference;

  const rows = chosen.map((c) => ({ charge: c, amount: money(amounts[c.id] ?? "") }));
  const autoFine = useMemo(
    () => lateFineFor(account.rules, rows.filter((r) => r.amount > 0).map((r) => ({ base: r.amount, dueDate: r.charge.dueDate })), paidOn || today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [account.rules, amounts, paidOn],
  );
  const fine = fineText === null ? autoFine : money(fineText);
  const itemsTotal = rows.reduce((sum, r) => sum + (Number.isFinite(r.amount) ? r.amount : 0), 0);
  const total = Math.round((itemsTotal + (Number.isFinite(fine) ? fine : 0)) * 100) / 100;

  async function submit() {
    setProblem(null);
    const local: Record<string, string> = {};
    for (const { charge, amount } of rows) {
      if (!(amount > 0)) local[`amount-${charge.id}`] = "Enter the amount";
      else if (amount > charge.outstanding + 0.005) local[`amount-${charge.id}`] = `Only ${rupees(charge.outstanding)} is owed`;
      else if (!account.rules.allowPartial && amount < charge.outstanding - 0.005) local[`amount-${charge.id}`] = `The school takes the whole instalment (${rupees(charge.outstanding)})`;
    }
    if (needsReference && reference.trim() === "") local.reference = mode === "cheque" ? "Enter the cheque number" : "Enter the draft number";
    if (!Number.isFinite(fine) || fine < 0) local.lateFine = "Enter the late fine (0 for none)";
    if (!paidOn) local.paidOn = "Choose the day paid";
    setErrors(local);
    if (Object.keys(local).length > 0) return;
    try {
      const made = await collect({
        studentId: account.student.id,
        mode,
        reference: reference.trim() || null,
        paidOn,
        items: rows.map((r) => ({ chargeId: r.charge.id, amount: r.amount })),
        lateFine: fine,
        note: note.trim() || null,
      }).unwrap();
      onDone(made.data);
    } catch (err) {
      const server = fieldErrorsOf(err, getApiError);
      const mapped: Record<string, string> = {};
      for (const [path, message] of Object.entries(server)) {
        const at = /^items\.(\d+)\.amount$/.exec(path);
        mapped[at ? `amount-${chosen[Number(at[1])]?.id}` : path] = message;
      }
      setErrors(mapped);
      setProblem(Object.keys(mapped).length > 0 ? null : (getApiError(err)?.message ?? "Could not take the payment. Please try again."));
    }
  }

  return (
    <AppModal
      title={`Collect fees from ${account.student.name}`}
      icon={HandCoins}
      size="lg"
      busy={collecting.isLoading}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={collecting.isLoading}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={collecting.isLoading}>
            Take {rupees(total)}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {rows.map(({ charge }) => (
          <Field key={charge.id} id={`amount-${charge.id}`} label={`${charge.label} (due ${formatDay(charge.dueDate)}, owed ${rupees(charge.outstanding)})`} error={errors[`amount-${charge.id}`]} quiet>
            <Input
              id={`amount-${charge.id}`}
              inputMode="decimal"
              value={amounts[charge.id] ?? ""}
              readOnly={!account.rules.allowPartial}
              aria-invalid={!!errors[`amount-${charge.id}`]}
              onChange={(e) => setAmounts((a) => ({ ...a, [charge.id]: e.target.value }))}
            />
          </Field>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="pay-mode" label="How it was paid">
          <Select id="pay-mode" options={PAYMENT_MODES.map((m) => ({ value: m.value, label: m.label }))} value={mode} onChange={(v) => setMode(v as PaymentMode)} />
        </Field>
        <Field id="pay-day" label="Day paid" error={errors.paidOn}>
          <DateBox id="pay-day" label="Day paid" value={paidOn} onChange={setPaidOn} max={today} invalid={!!errors.paidOn} />
        </Field>
      </div>

      {needsReference && (
        <Field id="pay-reference" label={mode === "cheque" ? "Cheque number" : "Draft number"} error={errors.reference}>
          <Input id="pay-reference" value={reference} maxLength={60} aria-invalid={!!errors.reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      )}
      {!needsReference && (
        <Field id="pay-reference" label="Reference (UTR, last digits...)" optional>
          <Input id="pay-reference" value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} />
        </Field>
      )}

      <Field
        id="pay-fine"
        label="Late fine"
        error={errors.lateFine}
        hint={autoFine > 0 ? `By the school's rules: ${rupees(autoFine)}. You may take less.` : "No late fine for this payment."}
      >
        <Input id="pay-fine" inputMode="decimal" value={fineText ?? String(autoFine)} aria-invalid={!!errors.lateFine} onChange={(e) => setFineText(e.target.value)} />
      </Field>

      <Field id="pay-note" label="Note" optional>
        <Textarea id="pay-note" value={note} maxLength={200} rows={2} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <p className="flex items-baseline justify-between rounded-xl bg-surface-muted px-3 py-2 text-sm">
        <span className="text-foreground-secondary">
          {rupees(itemsTotal)} fees{Number.isFinite(fine) && fine > 0 ? ` + ${rupees(fine)} late fine` : ""}
        </span>
        <b className="text-base tabular-nums">{rupees(total)}</b>
      </p>
      <ModalError message={problem} />
    </AppModal>
  );
}
