import { useState } from "react";
import { Ban, Banknote, CircleAlert, ReceiptText, X } from "lucide-react";
import { CancelReceiptDialog } from "../../components/fees/AccountDialogs";
import { ReceiptDialog } from "../../components/fees/ReceiptDialog";
import { StatTile } from "../../components/dashboard/school/StatTile";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { DateBox } from "../../components/ui/DateBox";
import { Skeleton } from "../../components/ui/Skeleton";
import { useCan } from "../../hooks/useCan";
import { useGetCollectionQuery, useGetReceiptsQuery } from "../../redux/api/feesApi";
import type { Receipt } from "../../types";
import { formatDay } from "../../utils/academicYear";
import { getApiError } from "../../utils/apiErrors";
import { rupees, todayInIndia } from "../../utils/fees";

/**
 * Fees > Receipts (`/fees/receipts`): what was taken in a window of days (today to start with): the total, by how it was paid, the late fine and what was
 * cancelled, and every receipt of those days. A receipt opens to be printed; one who manages the fees may cancel one (with a reason).
 */
export default function ReceiptsPage() {
  const can = useCan();
  const today = todayInIndia();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Pick<Receipt, "id" | "number" | "studentName" | "total"> | null>(null);
  const days = { from: from || undefined, to: to || undefined };
  const summary = useGetCollectionQuery(days);
  const list = useGetReceiptsQuery(days);
  const s = summary.data?.data;
  const receipts = list.data?.data.items;

  return (
    <div className="space-y-6">
      <StudentFormHeader title="Receipts" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <DateBox id="receipts-from" label="From" value={from} onChange={setFrom} max={today} />
        </div>
        <div className="w-48">
          <DateBox id="receipts-to" label="To" value={to} onChange={setTo} min={from || undefined} max={today} />
        </div>
        <Button variant="outline" onClick={() => (setFrom(today), setTo(today))}>
          Today
        </Button>
      </div>

      <section aria-label="About the collection" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Collected" value={s ? rupees(s.total) : null} icon={Banknote} tone="success" />
        <StatTile label="Receipts" value={s?.receipts ?? null} icon={ReceiptText} tone="primary" />
        <StatTile label="Late fine taken" value={s ? rupees(s.lateFine) : null} icon={CircleAlert} tone="warning" />
        <StatTile label="Cancelled" value={s ? s.cancelled.count : null} icon={Ban} tone={s && s.cancelled.count > 0 ? "danger" : "success"} hint={s && s.cancelled.count > 0 ? rupees(s.cancelled.total) : undefined} />
      </section>

      {s && s.byMode.length > 0 && (
        <ul aria-label="By how it was paid" className="flex flex-wrap gap-2">
          {s.byMode.map((m) => (
            <li key={m.mode}>
              <Badge tone="neutral" className="h-auto py-1">
                {m.modeLabel}: <b className="ml-1">{rupees(m.total)}</b>
                <span className="ml-1 font-normal text-foreground-muted">({m.count})</span>
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {!receipts ? (
        list.error ? (
          <Card className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-danger">{getApiError(list.error)?.message ?? "Could not load the receipts."}</p>
            <Button variant="outline" onClick={() => void list.refetch()}>
              Try again
            </Button>
          </Card>
        ) : (
          <Skeleton className="h-64 rounded-2xl" />
        )
      ) : receipts.length === 0 ? (
        <StudentsNotice icon={ReceiptText} tone="primary" title="No receipt in these days" />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Receipts</caption>
            <thead className="border-b border-border bg-background text-left text-[11px] font-bold uppercase tracking-wider text-foreground-muted">
              <tr>
                <th scope="col" className="px-3 py-3">
                  Receipt
                </th>
                <th scope="col" className="px-3 py-3">
                  Student
                </th>
                <th scope="col" className="px-3 py-3">
                  Date
                </th>
                <th scope="col" className="px-3 py-3">
                  Paid by
                </th>
                <th scope="col" className="px-3 py-3 text-right">
                  Total
                </th>
                <th scope="col" className="px-3 py-3">
                  <span className="sr-only">Status</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} className="border-t border-surface-muted">
                  <th scope="row" className="px-3 py-3 text-left">
                    <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setOpenId(r.id)}>
                      {r.number}
                    </button>
                  </th>
                  <td className="px-3 py-3">
                    {r.studentName}
                    <span className="block text-xs text-foreground-muted">{[r.classLabel, r.admissionNumber].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td className="px-3 py-3 text-foreground-secondary">{formatDay(r.paidOn)}</td>
                  <td className="px-3 py-3 text-foreground-secondary">{r.reference ? `${r.modeLabel} (${r.reference})` : r.modeLabel}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{rupees(r.total)}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {r.status === "cancelled" ? <Badge tone="danger">Cancelled</Badge> : <Badge tone="success">Valid</Badge>}
                      {r.status === "valid" && can("fees.manage") && (
                        <Button variant="ghost" size="sm" aria-label={`Cancel receipt ${r.number}`} onClick={() => setCancelling({ id: r.id, number: r.number, studentName: r.studentName, total: r.total })}>
                          <X className="size-4" aria-hidden />
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
      {list.data && list.data.data.items.length >= list.data.data.limit && <p className="text-xs text-foreground-muted">Showing the latest {list.data.data.limit} receipts. Choose fewer days to see the rest.</p>}

      {openId && <ReceiptDialog id={openId} onClose={() => setOpenId(null)} />}
      {cancelling && <CancelReceiptDialog receipt={cancelling} onClose={() => setCancelling(null)} />}
    </div>
  );
}
