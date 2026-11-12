import { useMemo, useState } from "react";
import { ListChecks, Pencil, Plus, Search, Tags, Trash2 } from "lucide-react";
import { ConfirmModal } from "../../components/classes/ConfirmModal";
import { FeeHeadDialog } from "../../components/fees/FeeHeadDialog";
import { StatusChips } from "../../components/fees/StatusChips";
import { UsualFeesDialog } from "../../components/fees/UsualFeesDialog";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";
import { APPLIES_LABEL, FREQUENCY_LABEL } from "../../constants/fees";
import { useCan } from "../../hooks/useCan";
import { useDeleteFeeHeadMutation, useGetFeeHeadsQuery } from "../../redux/api/feesApi";
import type { FeeHead, FeeStatus } from "../../types";
import { getApiError } from "../../utils/apiErrors";

const TH = "whitespace-nowrap px-4 py-3 text-left text-[13.5px] font-semibold text-foreground";

/**
 * Fees > Fee heads (`/fees/heads`): the school's own list of fees (Tuition, Admission, Exam, Uniform...), the same every session. Each says
 * what it is about, how it is usually charged and who usually pays it, and whether it is optional or given back. "Add the usual fees" picks
 * from the fees most schools have. A fee that is on a fee chart cannot be deleted, only switched off.
 */
export default function FeeHeadsPage() {
  const can = useCan();
  const mayChange = can("fees.manage");
  const { push } = useToast();
  const [status, setStatus] = useState<FeeStatus>("active");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ kind: "head"; head?: FeeHead } | { kind: "usual" } | null>(null);
  const [removing, setRemoving] = useState<FeeHead | null>(null);
  const res = useGetFeeHeadsQuery(status);
  const [deleteHead] = useDeleteFeeHeadMutation();
  const all = useGetFeeHeadsQuery("all").data?.data.items ?? [];
  const heads = res.data?.data.items;
  const shown = useMemo(() => (heads ?? []).filter((h) => !search.trim() || h.name.toLowerCase().includes(search.trim().toLowerCase())), [heads, search]);

  const buttons = mayChange ? (
    <>
      <Button variant="outline" onClick={() => setDialog({ kind: "usual" })}>
        <ListChecks className="size-4" aria-hidden />
        Add the usual fees
      </Button>
      <Button onClick={() => setDialog({ kind: "head" })}>
        <Plus className="size-4" aria-hidden />
        Add a fee
      </Button>
    </>
  ) : undefined;

  return (
    <div className="space-y-6">
      <StudentFormHeader title="Fee heads" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} actions={buttons} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <Input icon={Search} type="search" aria-label="Search the fees" placeholder="Search the fees" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <StatusChips value={status} onChange={setStatus} name="fee-head-status" />
      </div>

      {!heads ? (
        res.error ? (
          <Card className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the fees."}</p>
            <Button variant="outline" onClick={() => void res.refetch()}>
              Try again
            </Button>
          </Card>
        ) : (
          <Skeleton className="h-64 rounded-2xl" />
        )
      ) : shown.length === 0 ? (
        <StudentsNotice
          icon={Tags}
          tone="primary"
          title={search || status !== "active" ? "No fee matches" : "No fees in your list yet"}
          actions={mayChange && !search && status === "active" ? buttons : undefined}
        >
          {!search && status === "active" && <p>Registration, admission, tuition, exam, uniform and the rest: pick the ones your school charges.</p>}
        </StudentsNotice>
      ) : (
        <Card className="overflow-x-auto">
          <table aria-label="Fees" className="w-full min-w-[48rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted/60">
                <th scope="col" className={TH}>Fee</th>
                <th scope="col" className={TH}>About</th>
                <th scope="col" className={TH}>Usually charged</th>
                <th scope="col" className={TH}>Usually paid by</th>
                <th scope="col" className={TH}>Status</th>
                {mayChange && <th scope="col" className="w-24 px-2"><span className="sr-only">Change</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((h) => (
                <tr key={h.id} className={h.isActive ? undefined : "opacity-60"}>
                  <td className="px-4 py-3 align-top">
                    <span className="block font-bold text-foreground">{h.name}</span>
                    {h.notes && <span className="block text-xs text-foreground-muted">{h.notes}</span>}
                  </td>
                  <td className="px-4 py-3 align-top text-foreground-muted">{h.kindLabel}</td>
                  <td className="px-4 py-3 align-top">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {FREQUENCY_LABEL[h.defaultFrequency]}
                      {h.defaultOptional && <Badge tone="warning">Optional</Badge>}
                      {h.refundable && <Badge tone="success">Refundable</Badge>}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top text-foreground-muted">{h.defaultFrequency === "one_time" ? "New students only" : APPLIES_LABEL[h.defaultAppliesTo]}</td>
                  <td className="px-4 py-3 align-top">
                    <Badge tone={h.isActive ? "success" : "neutral"}>{h.isActive ? "In use" : "Switched off"}</Badge>
                  </td>
                  {mayChange && (
                    <td className="px-2 py-3 text-right align-top">
                      <span className="inline-flex gap-1">
                        <Button variant="outline" size="sm" aria-label={`Change ${h.name}`} onClick={() => setDialog({ kind: "head", head: h })}>
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                        {!h.inUse && (
                          <Button variant="outline" size="sm" aria-label={`Delete ${h.name}`} onClick={() => setRemoving(h)}>
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        )}
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {dialog?.kind === "head" && <FeeHeadDialog head={dialog.head} onClose={() => setDialog(null)} />}
      {dialog?.kind === "usual" && <UsualFeesDialog have={all.map((h) => h.name)} onClose={() => setDialog(null)} />}
      {removing && (
        <ConfirmModal
          title={`Delete ${removing.name}?`}
          confirmLabel="Delete"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await deleteHead(removing.id).unwrap();
            push("success", "Fee deleted");
          }}
        >
          <p>It leaves your list of fees. It is on no fee chart and in no concession.</p>
        </ConfirmModal>
      )}
    </div>
  );
}
