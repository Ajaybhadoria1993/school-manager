import { IndianRupee, Info } from "lucide-react";
import { CHARGE_LOOK, PAYMENT_LABEL } from "../../constants/fees";
import { useGetChildFeesQuery } from "../../redux/api/parentApi";
import { formatDay } from "../../utils/academicYear";
import type { ChildFeeAccount } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { dueRulesWords, howOften, rupees } from "../../utils/fees";
import { Badge } from "../ui/Badge";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";

/**
 * The child's fees, for their parent: their account (what is owed instalment by instalment, what was paid, what is due now and what is late, the
 * concessions in force and the receipts), then the school's fee chart for the class (the compulsory fees, the ones the family may choose, the part that
 * is given back), the bus fee of the stop the child boards at, and the school's due day and late fine. A parent cannot pay here: the money is taken at
 * the school office, and the account follows from it.
 */
export function ChildFeesSection({ childId }: { childId: string }) {
  const res = useGetChildFeesQuery(childId);
  const fees = res.data?.data;

  return (
    <section aria-label="Fees" className="space-y-3">
      <h2 className="text-section-heading flex items-center gap-2">
        <IndianRupee className="size-5 text-primary" aria-hidden />
        Fees
      </h2>
      {res.isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : !fees ? (
        <Card className="px-5 py-8 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the fees."}</Card>
      ) : (
        <Card className="space-y-4 p-5">
          {fees.account && fees.account.charges.length > 0 ? <Account account={fees.account} /> : null}

          <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-sm text-info">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {fees.account && fees.account.charges.length > 0 ? "Fees are paid at the school office; what you pay shows above, with its receipt." : "Fees are paid at the school office."} Below is the school&apos;s fee chart
              {fees.className ? ` for ${fees.className}` : ""}
              {fees.year ? `, ${fees.year.name}` : ""}.
            </span>
          </p>

          {!fees.chart || fees.chart.lines.length === 0 ? (
            <p className="text-center text-sm text-foreground-muted">The school has not set up the fees for this class yet.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Fees of {fees.className}</caption>
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-foreground-muted">
                      <th scope="col" className="py-2 pr-3 font-semibold">
                        Fee
                      </th>
                      <th scope="col" className="px-3 py-2 text-right font-semibold">
                        Amount
                      </th>
                      <th scope="col" className="px-3 py-2 font-semibold">
                        How often
                      </th>
                      <th scope="col" className="py-2 pl-3 text-right font-semibold">
                        For the year
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {fees.chart.lines.map((l) => (
                      <tr key={l.id}>
                        <th scope="row" className="py-2 pr-3 text-left font-semibold">
                          {l.headName}
                          {l.optional && (
                            <Badge tone="neutral" className="ml-2">
                              Optional
                            </Badge>
                          )}
                          {l.refundable && (
                            <Badge tone="info" className="ml-2">
                              Given back
                            </Badge>
                          )}
                        </th>
                        <td className="px-3 py-2 text-right tabular-nums">{rupees(l.amount)}</td>
                        <td className="px-3 py-2 text-foreground-secondary">{howOften(l, fees.year?.startMonth ?? 4)}</td>
                        <td className="py-2 pl-3 text-right font-semibold tabular-nums">{rupees(l.yearly)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <dl className="grid gap-x-6 gap-y-2 border-t border-border pt-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-caption-subtle">Compulsory fees for the year</dt>
                  <dd className="text-lg font-bold tabular-nums">{rupees(fees.chart.compulsory)}</dd>
                </div>
                {fees.chart.optional > 0 && (
                  <div>
                    <dt className="text-caption-subtle">Optional, if you choose them</dt>
                    <dd className="text-lg font-bold tabular-nums">{rupees(fees.chart.optional)}</dd>
                  </div>
                )}
                {fees.chart.refundable > 0 && (
                  <div>
                    <dt className="text-caption-subtle">Of it, given back when the child leaves</dt>
                    <dd className="text-lg font-bold tabular-nums">{rupees(fees.chart.refundable)}</dd>
                  </div>
                )}
              </dl>
            </>
          )}

          {fees.transport && (
            <p className="text-sm text-foreground-secondary">
              <b className="text-foreground">School bus</b> ({fees.transport.route}, {fees.transport.stop}):{" "}
              {fees.transport.monthlyFee == null ? "no fee is set for this stop." : `${rupees(fees.transport.monthlyFee)} a month. It is not in the totals above.`}
            </p>
          )}

          <p className="text-xs text-foreground-muted">
            {dueRulesWords(fees.rules).join(" ")}
            {fees.rules.allowPartial ? " Part payment is allowed." : ""}
          </p>
        </Card>
      )}
    </section>
  );
}

/** What the child owes, has paid and is due: four numbers, the instalments, the concessions in force and the receipts that stand. */
function Account({ account }: { account: ChildFeeAccount }) {
  const t = account.totals;
  const owing = t.outstanding > 0;
  return (
    <div className="space-y-4" aria-label="Fee account" role="group">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-caption-subtle">Fees this session</dt>
          <dd className="text-lg font-bold tabular-nums">{rupees(t.net)}</dd>
          {t.concession > 0 && <p className="text-xs text-success">After {rupees(t.concession)} concession</p>}
        </div>
        <div>
          <dt className="text-caption-subtle">Paid</dt>
          <dd className="text-lg font-bold tabular-nums text-success">{rupees(t.paid)}</dd>
        </div>
        <div>
          <dt className="text-caption-subtle">Due now</dt>
          <dd className={owing && t.dueNow > 0 ? "text-lg font-bold tabular-nums text-warning" : "text-lg font-bold tabular-nums"}>{rupees(t.dueNow)}</dd>
        </div>
        <div>
          <dt className="text-caption-subtle">Late</dt>
          <dd className={t.overdue > 0 ? "text-lg font-bold tabular-nums text-danger" : "text-lg font-bold tabular-nums"}>{rupees(t.overdue)}</dd>
          {account.lateFineToday > 0 && <p className="text-xs text-foreground-muted">Late fine {rupees(account.lateFineToday)} if paid today</p>}
        </div>
      </dl>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Instalments</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-foreground-muted">
              <th scope="col" className="py-2 pr-3 font-semibold">
                Fee
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Due
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Amount
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Owed
              </th>
              <th scope="col" className="py-2 pl-3 font-semibold">
                <span className="sr-only">Status</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {account.charges.map((c) => (
              <tr key={c.id}>
                <th scope="row" className="py-2 pr-3 text-left font-semibold">
                  {c.label}
                </th>
                <td className="px-3 py-2 text-foreground-secondary">{formatDay(c.dueDate)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {rupees(c.net)}
                  {c.concession > 0 && <span className="block text-xs text-success">{rupees(c.concession)} off</span>}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{rupees(c.outstanding)}</td>
                <td className="py-2 pl-3">
                  <Badge tone={CHARGE_LOOK[c.status].tone}>{CHARGE_LOOK[c.status].label}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {account.concessions.length > 0 && (
        <p className="text-sm text-foreground-secondary">
          <b className="text-foreground">Concession:</b> {account.concessions.map((c) => `${c.name} (${c.mode === "percent" ? `${c.value}%` : rupees(c.value)} off)`).join(", ")}
        </p>
      )}

      <div>
        <h3 className="text-sm font-bold">Receipts</h3>
        {account.receipts.length === 0 ? (
          <p className="text-sm text-foreground-muted">No payment has been taken yet.</p>
        ) : (
          <ul className="mt-1 divide-y divide-border text-sm">
            {account.receipts.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                <span className="font-semibold">{r.number}</span>
                <span className="text-foreground-secondary">
                  {formatDay(r.paidOn)} · {PAYMENT_LABEL[r.mode]}
                </span>
                <b className="tabular-nums">{rupees(r.total)}</b>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
