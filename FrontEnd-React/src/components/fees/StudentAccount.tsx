import { useState } from "react";
import { BadgePercent, Check, HandCoins, Plus, ReceiptText, Trash2, X } from "lucide-react";
import { CHARGE_LOOK, PAYMENT_LABEL } from "../../constants/fees";
import { useCan } from "../../hooks/useCan";
import { useAddOptionalFeeMutation, useApproveStudentConcessionMutation, useRemoveOptionalFeeMutation, useRevokeStudentConcessionMutation } from "../../redux/api/feesApi";
import { useAuth } from "../../hooks/useAuth";
import type { AccountCharge, FeeAccount, Receipt } from "../../types";
import { formatDay } from "../../utils/academicYear";
import { getApiError } from "../../utils/apiErrors";
import { rupees } from "../../utils/fees";
import { cn } from "../../utils/helpers";
import { StatTile } from "../dashboard/school/StatTile";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { useToast } from "../ui/toast-context";
import { CancelReceiptDialog, GiveConcessionDialog } from "./AccountDialogs";
import { CollectDialog } from "./CollectDialog";
import { ReceiptDialog } from "./ReceiptDialog";

/**
 * One student's fee account for the running session: what is owed (instalment by instalment), what was paid, what is due now and what is late; the
 * concessions the student has; the optional fees the family may take; and the receipts. The cashier ticks the instalments being paid and takes the
 * payment; the rest of the person's rights follow the school's Permissions (giving a concession and cancelling a receipt are for those who manage the
 * fees, approving one that waited is for the school admin and the principal).
 */
export function StudentAccount({ account }: { account: FeeAccount }) {
  const can = useCan();
  const { user } = useAuth();
  const mayManage = can("fees.manage");
  const mayApprove = user?.role === "school_admin" || user?.role === "principal";
  const running = account.year.status === "active";
  const { push } = useToast();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [collecting, setCollecting] = useState<AccountCharge[] | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Pick<Receipt, "id" | "number" | "studentName" | "total"> | null>(null);
  const [giving, setGiving] = useState(false);
  const [addOptional, adding] = useAddOptionalFeeMutation();
  const [removeOptional] = useRemoveOptionalFeeMutation();
  const [approve] = useApproveStudentConcessionMutation();
  const [revoke] = useRevokeStudentConcessionMutation();

  const owing = account.charges.filter((c) => c.outstanding > 0);
  const chosen = owing.filter((c) => picked.has(c.id));
  const dueNow = owing.filter((c) => c.status !== "upcoming");
  const pickedTotal = Math.round(chosen.reduce((s, c) => s + c.outstanding, 0) * 100) / 100;
  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  async function act(run: () => Promise<unknown>, done: string) {
    try {
      await run();
      push("success", done);
    } catch (err) {
      push("error", getApiError(err)?.message ?? "That did not work. Please try again.");
    }
  }

  return (
    <div className="space-y-6">
      <section aria-label="About the account" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Fees this session" value={rupees(account.totals.net)} icon={ReceiptText} tone="primary" hint={account.totals.concession > 0 ? `After ${rupees(account.totals.concession)} concession` : undefined} />
        <StatTile label="Paid" value={rupees(account.totals.paid)} icon={Check} tone="success" />
        <StatTile label="Due now" value={rupees(account.totals.dueNow)} icon={HandCoins} tone={account.totals.dueNow > 0 ? "warning" : "success"} />
        <StatTile label="Late" value={rupees(account.totals.overdue)} icon={X} tone={account.totals.overdue > 0 ? "danger" : "success"} hint={account.lateFineToday > 0 ? `Late fine ${rupees(account.lateFineToday)}` : undefined} />
      </section>

      <section aria-label="Fees owed" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-section-heading">Fees of {account.year.name}</h2>
          {running && owing.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPicked(new Set(dueNow.map((c) => c.id)))} disabled={dueNow.length === 0}>
                Tick all that are due
              </Button>
              <Button onClick={() => setCollecting(chosen)} disabled={chosen.length === 0}>
                <HandCoins className="size-4" aria-hidden />
                {chosen.length > 0 ? `Collect ${rupees(pickedTotal)}` : "Collect"}
              </Button>
            </div>
          )}
        </div>
        {account.charges.length === 0 ? (
          <Card className="px-5 py-8 text-center text-sm text-foreground-muted">No fees are set for {account.student.classLabel ?? "this student's class"} this session yet. Set the class&apos;s fees in Fee structure.</Card>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Fees of {account.student.name}</caption>
              <thead className="border-b border-border bg-background text-left text-[11px] font-bold uppercase tracking-wider text-foreground-muted">
                <tr>
                  <th scope="col" className="w-10 px-3 py-3">
                    <span className="sr-only">Choose</span>
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Fee
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Due
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    Amount
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    Paid
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    Owed
                  </th>
                  <th scope="col" className="px-3 py-3">
                    <span className="sr-only">Status</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {account.charges.map((c) => (
                  <tr key={c.id} className={cn("border-t border-surface-muted", picked.has(c.id) && "bg-primary-soft/40")}>
                    <td className="px-3 py-2.5">
                      {c.outstanding > 0 && running && <input type="checkbox" className="size-4 accent-[var(--color-primary)]" aria-label={`Choose ${c.label}`} checked={picked.has(c.id)} onChange={() => toggle(c.id)} />}
                    </td>
                    <th scope="row" className="px-3 py-2.5 text-left font-semibold">
                      {c.label}
                      {c.source === "optional" && (
                        <Badge tone="neutral" className="ml-2">
                          Optional
                        </Badge>
                      )}
                    </th>
                    <td className="px-3 py-2.5 text-foreground-secondary">{formatDay(c.dueDate)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {rupees(c.net)}
                      {c.concession > 0 && <span className="block text-xs text-success">{rupees(c.concession)} off</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{rupees(c.paid)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{rupees(c.outstanding)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <Badge tone={CHARGE_LOOK[c.status].tone}>{CHARGE_LOOK[c.status].label}</Badge>
                        {c.source === "optional" && c.paid === 0 && running && (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Take ${c.headName} off`}
                            onClick={() => {
                              const offer = c.headName;
                              void act(() => removeOptional({ studentId: account.student.id, lineId: c.lineId ?? "" }).unwrap(), `${offer} taken off`);
                            }}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {running && account.optional.length > 0 && (
        <section aria-label="Optional fees" className="space-y-2">
          <h2 className="text-section-heading">Optional fees</h2>
          <ul className="flex flex-wrap gap-2">
            {account.optional.map((o) => (
              <li key={o.lineId}>
                <Button variant="outline" size="sm" disabled={adding.isLoading} onClick={() => void act(() => addOptional({ studentId: account.student.id, lineId: o.lineId }).unwrap(), `${o.headName} added`)}>
                  <Plus className="size-4" aria-hidden />
                  {o.headName} {rupees(o.amount)}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Concessions" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-section-heading">Concessions</h2>
          {mayManage && running && (
            <Button variant="outline" size="sm" onClick={() => setGiving(true)}>
              <BadgePercent className="size-4" aria-hidden />
              Give a concession
            </Button>
          )}
        </div>
        {account.concessions.length === 0 ? (
          <p className="text-sm text-foreground-muted">No concession is given to this student.</p>
        ) : (
          <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">
            {account.concessions.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {c.name} <span className="font-normal text-foreground-muted">({c.mode === "percent" ? `${c.value}%` : rupees(c.value)} off)</span>
                  </p>
                  {c.note && <p className="text-xs text-foreground-muted">{c.note}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {c.status === "pending" ? <Badge tone="warning">Waiting for approval</Badge> : <Badge tone="success">In force</Badge>}
                  {c.status === "pending" && mayApprove && (
                    <Button variant="outline" size="sm" onClick={() => void act(() => approve(c.id).unwrap(), `${c.name} approved`)}>
                      Approve
                    </Button>
                  )}
                  {mayManage && running && (
                    <Button variant="ghost" size="sm" aria-label={`Take back ${c.name}`} onClick={() => void act(() => revoke(c.id).unwrap(), `${c.name} taken back`)}>
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Receipts" className="space-y-2">
        <h2 className="text-section-heading">Receipts</h2>
        {account.receipts.length === 0 ? (
          <p className="text-sm text-foreground-muted">No payment has been taken yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-surface">
            {account.receipts.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <button type="button" className="text-left font-semibold text-primary hover:underline" onClick={() => setReceiptId(r.id)}>
                  {r.number}
                </button>
                <span className="text-foreground-secondary">
                  {formatDay(r.paidOn)} · {PAYMENT_LABEL[r.mode]}
                </span>
                <span className="flex items-center gap-2">
                  <b className="tabular-nums">{rupees(r.total)}</b>
                  {r.status === "cancelled" ? <Badge tone="danger">Cancelled</Badge> : <Badge tone="success">Valid</Badge>}
                  {r.status === "valid" && mayManage && running && (
                    <Button variant="ghost" size="sm" aria-label={`Cancel receipt ${r.number}`} onClick={() => setCancelling({ id: r.id, number: r.number, studentName: account.student.name, total: r.total })}>
                      <X className="size-4" aria-hidden />
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {collecting && (
        <CollectDialog
          account={account}
          chosen={collecting}
          onClose={() => setCollecting(null)}
          onDone={(receipt) => {
            setCollecting(null);
            setPicked(new Set());
            setReceiptId(receipt.id);
          }}
        />
      )}
      {receiptId && <ReceiptDialog id={receiptId} onClose={() => setReceiptId(null)} />}
      {cancelling && <CancelReceiptDialog receipt={cancelling} onClose={() => setCancelling(null)} />}
      {giving && <GiveConcessionDialog account={account} onClose={() => setGiving(false)} />}
    </div>
  );
}
