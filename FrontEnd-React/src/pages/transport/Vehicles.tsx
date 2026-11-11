import { useState } from "react";
import { Armchair, Bus, CircleAlert, Pencil, Plus, UserRoundCog } from "lucide-react";
import { AttentionCard, ListBar, PaperPill } from "../../components/transport/TransportBits";
import { VehicleDialog } from "../../components/transport/VehicleDialog";
import { StatTile } from "../../components/dashboard/school/StatTile";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import { useCan } from "../../hooks/useCan";
import { useGetTransportSummaryQuery, useGetVehiclesQuery } from "../../redux/api/transportApi";
import type { TransportStatus, Vehicle } from "../../types";
import { getApiError } from "../../utils/apiErrors";

const TH = "whitespace-nowrap px-4 py-3 text-left text-[13.5px] font-semibold text-foreground";

/**
 * Transport > Vehicles (`/transport/vehicles`): the school's buses and vans: the number it is called by and the one on its plate, the kind and
 * the seats, the routes it runs, and how each paper (insurance, fitness, pollution, permit) stands today: green valid, amber ending within a
 * month, red ended. The papers to renew are said above the list. A person who may change transport adds and changes vehicles.
 */
export default function VehiclesPage() {
  const can = useCan();
  const mayChange = can("transport.manage");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TransportStatus>("active");
  const [dialog, setDialog] = useState<{ vehicle?: Vehicle } | null>(null);
  const res = useGetVehiclesQuery({ search: search.trim(), status });
  const summary = useGetTransportSummaryQuery().data?.data;
  const vehicles = res.data?.data.items;

  const add = (
    <Button onClick={() => setDialog({})}>
      <Plus className="size-4" aria-hidden />
      Add vehicle
    </Button>
  );

  return (
    <div className="space-y-6">
      <StudentFormHeader title="Vehicles" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} actions={mayChange ? add : undefined} />

      <section aria-label="About the vehicles" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Vehicles" value={summary?.vehicles.total ?? null} icon={Bus} tone="primary" />
        <StatTile label="Seats" value={summary?.vehicles.seats ?? null} icon={Armchair} tone="success" />
        <StatTile label="Drivers" value={summary?.drivers.total ?? null} icon={UserRoundCog} tone="info" />
        <StatTile label="Papers to renew" value={summary?.attentionCount ?? null} icon={CircleAlert} tone={summary && summary.attentionCount > 0 ? "warning" : "success"} />
      </section>

      {summary && <AttentionCard items={summary.attention} kind="vehicle" />}

      <ListBar search={search} onSearch={setSearch} placeholder="Search by number, plate or model" status={status} onStatus={setStatus} />

      {!vehicles ? (
        res.error ? (
          <Card className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the vehicles."}</p>
            <Button variant="outline" onClick={() => void res.refetch()}>
              Try again
            </Button>
          </Card>
        ) : (
          <Skeleton className="h-64 rounded-2xl" />
        )
      ) : vehicles.length === 0 ? (
        <StudentsNotice icon={Bus} tone="primary" title={search || status !== "active" ? "No vehicle matches" : "No vehicles yet"} actions={mayChange && !search && status === "active" ? add : undefined} />
      ) : (
        <Card className="overflow-x-auto">
          <table aria-label="Vehicles" className="w-full min-w-[56rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted/60">
                <th scope="col" className={TH}>Vehicle</th>
                <th scope="col" className={TH}>Kind</th>
                <th scope="col" className={TH}>Seats</th>
                <th scope="col" className={TH}>Papers</th>
                <th scope="col" className={TH}>Routes</th>
                <th scope="col" className={TH}>Status</th>
                {mayChange && <th scope="col" className="w-14 px-2"><span className="sr-only">Change</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {vehicles.map((v) => (
                <tr key={v.id} className={v.isActive ? undefined : "opacity-60"}>
                  <td className="px-4 py-3 align-top">
                    <span className="block font-bold text-foreground">{v.number}</span>
                    <span className="block font-mono text-xs text-foreground-muted">{v.registrationNumber}</span>
                    {v.model && <span className="block text-xs text-foreground-muted">{v.model}</span>}
                  </td>
                  <td className="px-4 py-3 align-top">{v.typeLabel}</td>
                  <td className="px-4 py-3 align-top font-semibold">{v.seats}</td>
                  <td className="px-4 py-3 align-top">
                    <ul aria-label={`Papers of ${v.number}`} className="flex max-w-md flex-wrap gap-1.5">
                      {v.papers.map((p) => (
                        <li key={p.key}>
                          <PaperPill paper={p} />
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-4 py-3 align-top text-foreground-muted">{v.routes.length > 0 ? v.routes.join(", ") : "None yet"}</td>
                  <td className="px-4 py-3 align-top">
                    <Badge tone={v.isActive ? "success" : "neutral"}>{v.isActive ? "In use" : "Not in use"}</Badge>
                  </td>
                  {mayChange && (
                    <td className="px-2 py-3 text-right align-top">
                      <Button variant="outline" size="sm" aria-label={`Change ${v.number}`} onClick={() => setDialog({ vehicle: v })}>
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

      {dialog && <VehicleDialog vehicle={dialog.vehicle} onClose={() => setDialog(null)} />}
    </div>
  );
}
