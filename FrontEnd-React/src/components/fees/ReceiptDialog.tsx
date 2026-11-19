import { Printer, ReceiptText } from "lucide-react";
import "./receipt.css";
import { useGetReceiptQuery } from "../../redux/api/feesApi";
import { formatDay } from "../../utils/academicYear";
import { getApiError } from "../../utils/apiErrors";
import { rupees } from "../../utils/fees";
import { AppModal } from "../ui/AppModal";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Skeleton } from "../ui/Skeleton";

/** One receipt as it is printed: the school and session, the number, who paid for whom, what it settled, the late fine and the total. A cancelled receipt says so, and why. */
export function ReceiptDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const res = useGetReceiptQuery(id);
  const r = res.data?.data;

  return (
    <AppModal
      title={r ? `Receipt ${r.number}` : "Receipt"}
      icon={ReceiptText}
      size="lg"
      onClose={onClose}
      footer={
        <>
          {r && (
            <Button variant="outline" onClick={() => window.print()} className="receipt-noprint">
              <Printer className="size-4" aria-hidden />
              Print
            </Button>
          )}
          <Button onClick={onClose} className="receipt-noprint">
            Done
          </Button>
        </>
      }
    >
      {!r ? (
        res.error ? (
          <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the receipt."}</p>
        ) : (
          <Skeleton className="h-48 rounded-xl" />
        )
      ) : (
        <article className="receipt-sheet space-y-4 text-sm" aria-label={`Receipt ${r.number}`}>
          <header className="border-b border-border pb-3 text-center">
            <h3 className="text-base font-bold">{r.school}</h3>
            <p className="text-foreground-muted">Fee receipt · {r.year}</p>
          </header>
          {r.status === "cancelled" && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 font-semibold text-danger">
              This receipt was cancelled{r.cancelledBy ? ` by ${r.cancelledBy}` : ""}: {r.cancelReason}
            </p>
          )}
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            <div className="flex justify-between gap-3">
              <dt className="text-foreground-muted">Receipt no.</dt>
              <dd className="font-semibold">{r.number}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-foreground-muted">Date</dt>
              <dd className="font-semibold">{formatDay(r.paidOn)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-foreground-muted">Student</dt>
              <dd className="font-semibold">{r.studentName}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-foreground-muted">Class</dt>
              <dd className="font-semibold">{r.classLabel ?? "-"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-foreground-muted">Admission no.</dt>
              <dd className="font-semibold">{r.admissionNumber}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-foreground-muted">Paid by</dt>
              <dd className="font-semibold">{r.reference ? `${r.modeLabel} (${r.reference})` : r.modeLabel}</dd>
            </div>
          </dl>
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-xs text-foreground-muted">
                <th scope="col" className="py-1.5 font-semibold">
                  Fee
                </th>
                <th scope="col" className="py-1.5 text-right font-semibold">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {r.items.map((i) => (
                <tr key={i.chargeId}>
                  <td className="py-1.5">{i.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{rupees(i.amount)}</td>
                </tr>
              ))}
              {r.lateFine > 0 && (
                <tr>
                  <td className="py-1.5">Late fine</td>
                  <td className="py-1.5 text-right tabular-nums">{rupees(r.lateFine)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <th scope="row" className="py-2 text-left">
                  Total received
                </th>
                <td className="py-2 text-right text-base font-bold tabular-nums">{rupees(r.total)}</td>
              </tr>
            </tfoot>
          </table>
          {r.note && <p className="text-foreground-secondary">Note: {r.note}</p>}
          <footer className="flex items-center justify-between text-xs text-foreground-muted">
            <span>Received by {r.receivedBy}</span>
            {r.status === "valid" ? <Badge tone="success">Valid</Badge> : <Badge tone="danger">Cancelled</Badge>}
          </footer>
        </article>
      )}
    </AppModal>
  );
}
