import { useState } from "react";
import { CircleAlert, IdCard, Pencil, Plus, UserRoundCog, UsersRound } from "lucide-react";
import { AttentionCard, ListBar, PaperPill } from "../../components/transport/TransportBits";
import { CrewDialog } from "../../components/transport/CrewDialog";
import { StatTile } from "../../components/dashboard/school/StatTile";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import { useCan } from "../../hooks/useCan";
import { useGetCrewQuery, useGetTransportSummaryQuery } from "../../redux/api/transportApi";
import type { CrewMember, CrewRole, TransportStatus } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { formatDay } from "../../utils/academicYear";

const TH = "whitespace-nowrap px-4 py-3 text-left text-[13.5px] font-semibold text-foreground";

const ROLE_CHIPS: { value: CrewRole | "all"; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "driver", label: "Drivers" },
  { value: "attendant", label: "Attendants" },
];

/**
 * Transport > Drivers (`/transport/drivers`): the school's drivers and attendants (conductors, bus aunties and uncles): name, mobile and the
 * number to call in an emergency, a driver's licence number and how long it is valid, and the routes they run. Licences to renew are said
 * above the list. A person who may change transport adds and changes people.
 */
export default function DriversPage() {
  const can = useCan();
  const mayChange = can("transport.manage");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TransportStatus>("active");
  const [role, setRole] = useState<CrewRole | "all">("all");
  const [dialog, setDialog] = useState<{ person?: CrewMember; role?: CrewRole } | null>(null);
  const res = useGetCrewQuery({ search: search.trim(), status, role });
  const summary = useGetTransportSummaryQuery().data?.data;
  const people = res.data?.data.items;

  const add = (
    <>
      <Button variant="outline" onClick={() => setDialog({ role: "attendant" })}>
        <Plus className="size-4" aria-hidden />
        Add attendant
      </Button>
      <Button onClick={() => setDialog({ role: "driver" })}>
        <Plus className="size-4" aria-hidden />
        Add driver
      </Button>
    </>
  );

  return (
    <div className="space-y-6">
      <StudentFormHeader title="Drivers" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} actions={mayChange ? add : undefined} />

      <section aria-label="About the drivers" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Drivers" value={summary?.drivers.total ?? null} icon={UserRoundCog} tone="primary" />
        <StatTile label="Attendants" value={summary?.drivers.attendants ?? null} icon={UsersRound} tone="info" />
        <StatTile label="Routes without a driver" value={summary?.routes.withoutDriver ?? null} icon={IdCard} tone={summary && summary.routes.withoutDriver > 0 ? "warning" : "success"} />
        <StatTile label="Papers to renew" value={summary?.attentionCount ?? null} icon={CircleAlert} tone={summary && summary.attentionCount > 0 ? "warning" : "success"} />
      </section>

      {summary && <AttentionCard items={summary.attention} kind="driver" />}

      <ListBar
        search={search}
        onSearch={setSearch}
        placeholder="Search by name, mobile or licence"
        status={status}
        onStatus={setStatus}
        extra={
          <div role="radiogroup" aria-label="Who" className="inline-flex gap-1 rounded-xl border border-border bg-surface p-1 shadow-sm">
            {ROLE_CHIPS.map((c) => (
              <label key={c.value} className="relative">
                <input type="radio" name="crew-role" className="peer sr-only" checked={role === c.value} onChange={() => setRole(c.value)} />
                <span className="inline-flex h-9 cursor-pointer items-center rounded-lg px-3.5 text-sm font-semibold text-foreground-muted transition-colors peer-checked:bg-primary-soft peer-checked:text-primary-deep peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20">{c.label}</span>
              </label>
            ))}
          </div>
        }
      />

      {!people ? (
        res.error ? (
          <Card className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the drivers."}</p>
            <Button variant="outline" onClick={() => void res.refetch()}>
              Try again
            </Button>
          </Card>
        ) : (
          <Skeleton className="h-64 rounded-2xl" />
        )
      ) : people.length === 0 ? (
        <StudentsNotice icon={UserRoundCog} tone="primary" title={search || status !== "active" || role !== "all" ? "Nobody matches" : "No drivers yet"} actions={mayChange && !search && status === "active" && role === "all" ? add : undefined} />
      ) : (
        <Card className="overflow-x-auto">
          <table aria-label="Drivers and attendants" className="w-full min-w-[52rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted/60">
                <th scope="col" className={TH}>Name</th>
                <th scope="col" className={TH}>Mobile</th>
                <th scope="col" className={TH}>Licence</th>
                <th scope="col" className={TH}>Routes</th>
                <th scope="col" className={TH}>Status</th>
                {mayChange && <th scope="col" className="w-14 px-2"><span className="sr-only">Change</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {people.map((p) => (
                <tr key={p.id} className={p.isActive ? undefined : "opacity-60"}>
                  <td className="px-4 py-3 align-top">
                    <span className="block font-bold text-foreground">{p.name}</span>
                    <span className="block text-xs text-foreground-muted">{p.role === "driver" ? "Driver" : "Attendant"}{p.joiningDate ? ` · joined ${formatDay(p.joiningDate)}` : ""}</span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className="block font-mono text-xs">{p.mobile}</span>
                    {p.emergencyMobile && <span className="block text-xs text-foreground-muted">Emergency {p.emergencyMobile}</span>}
                  </td>
                  <td className="px-4 py-3 align-top">
                    {p.license ? (
                      <>
                        {p.licenseNumber && <span className="mb-1 block font-mono text-xs">{p.licenseNumber}</span>}
                        <PaperPill paper={p.license} />
                      </>
                    ) : (
                      <span className="text-foreground-muted">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-foreground-muted">{p.routes.length > 0 ? p.routes.join(", ") : "None yet"}</td>
                  <td className="px-4 py-3 align-top">
                    <Badge tone={p.isActive ? "success" : "neutral"}>{p.isActive ? "Working" : "Left"}</Badge>
                  </td>
                  {mayChange && (
                    <td className="px-2 py-3 text-right align-top">
                      <Button variant="outline" size="sm" aria-label={`Change ${p.name}`} onClick={() => setDialog({ person: p })}>
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {dialog && <CrewDialog person={dialog.person} role={dialog.role} onClose={() => setDialog(null)} />}
    </div>
  );
}
