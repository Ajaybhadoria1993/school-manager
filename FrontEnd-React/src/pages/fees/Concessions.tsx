import { useState } from "react";
import { BadgePercent, Pencil, Plus, Trash2 } from "lucide-react";
import { ConfirmModal } from "../../components/classes/ConfirmModal";
import { ConcessionDialog } from "../../components/fees/ConcessionDialog";
import { StatusChips } from "../../components/fees/StatusChips";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/toast-context";
import { BASIS_LABEL } from "../../constants/fees";
import { useCan } from "../../hooks/useCan";
import { useDeleteConcessionMutation, useGetConcessionsQuery, useGetFeeHeadsQuery } from "../../redux/api/feesApi";
import type { Concession, FeeStatus } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { offWords } from "../../utils/fees";

/**
 * Fees > Concessions (`/fees/concessions`): the concessions the school gives (a sibling, a staff member's child, an RTE seat, a topper...):
 * why, how much off (a percentage or an amount), which fees, and whether the principal must agree. It is the school's rule; giving one to a
 * student comes with collecting fees.
 */
export default function ConcessionsPage() {
  const can = useCan();
  const mayChange = can("fees.manage");
  const { push } = useToast();
  const [status, setStatus] = useState<FeeStatus>("active");
  const [dialog, setDialog] = useState<{ concession?: Concession } | null>(null);
  const [removing, setRemoving] = useState<Concession | null>(null);
  const res = useGetConcessionsQuery(status);
  const heads = useGetFeeHeadsQuery("active").data?.data.items ?? [];
  const [deleteConcession] = useDeleteConcessionMutation();
  const items = res.data?.data.items;

  const add = (
    <Button onClick={() => setDialog({})}>
      <Plus className="size-4" aria-hidden />
      Add a concession
    </Button>
  );

  return (
    <div className="space-y-6">
      <StudentFormHeader title="Concessions" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} actions={mayChange ? add : undefined} />
      <div className="flex justify-end">
        <StatusChips value={status} onChange={setStatus} name="concession-status" />
      </div>

      {!items ? (
        res.error ? (
          <Card className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the concessions."}</p>
            <Button variant="outline" onClick={() => void res.refetch()}>
              Try again
            </Button>
          </Card>
        ) : (
          <Skeleton className="h-48 rounded-2xl" />
        )
      ) : items.length === 0 ? (
        <StudentsNotice icon={BadgePercent} tone="primary" title={status === "active" ? "No concessions yet" : "No concession matches"} actions={mayChange && status === "active" ? add : undefined}>
          {status === "active" && <p>Sibling, staff child, RTE seat, a topper: add the ones your school gives.</p>}
        </StudentsNotice>
      ) : (
        <ul aria-label="Concessions" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => (
            <li key={c.id}>
              <Card className={c.isActive ? "h-full space-y-2 p-4" : "h-full space-y-2 p-4 opacity-60"}>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-section-heading min-w-0 truncate">{c.name}</h2>
                  {mayChange && (
                    <span className="inline-flex shrink-0 gap-1">
                      <Button variant="outline" size="sm" aria-label={`Change ${c.name}`} onClick={() => setDialog({ concession: c })}>
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button variant="outline" size="sm" aria-label={`Delete ${c.name}`} onClick={() => setRemoving(c)}>
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-primary-deep">{offWords(c)}</p>
                <p className="flex flex-wrap gap-1.5">
                  <Badge tone="primary">{BASIS_LABEL[c.basis]}</Badge>
                  <Badge tone={c.needsApproval ? "warning" : "neutral"}>{c.needsApproval ? "Needs approval" : "No approval needed"}</Badge>
                  {!c.isActive && <Badge tone="neutral">Switched off</Badge>}
                </p>
                {c.notes && <p className="text-xs text-foreground-muted">{c.notes}</p>}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {dialog && <ConcessionDialog concession={dialog.concession} heads={heads} onClose={() => setDialog(null)} />}
      {removing && (
        <ConfirmModal
          title={`Delete ${removing.name}?`}
          confirmLabel="Delete"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await deleteConcession(removing.id).unwrap();
            push("success", "Concession deleted");
          }}
        >
          <p>It leaves your list of concessions. To keep it but stop using it, switch it off instead.</p>
        </ConfirmModal>
      )}
    </div>
  );
}
