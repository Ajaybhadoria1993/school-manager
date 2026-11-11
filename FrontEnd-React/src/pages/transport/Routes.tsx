import { useState } from "react";
import { Bus, Clock3, MapPin, Pencil, Plus, Route as RouteIcon, UserRoundCog } from "lucide-react";
import { ListBar } from "../../components/transport/TransportBits";
import { clock } from "../../utils/transport";
import { RouteDialog } from "../../components/transport/RouteDialog";
import { StatTile } from "../../components/dashboard/school/StatTile";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import { useCan } from "../../hooks/useCan";
import { useGetRoutesQuery, useGetTransportSummaryQuery } from "../../redux/api/transportApi";
import type { TransportRoute, TransportStatus } from "../../types";
import { getApiError } from "../../utils/apiErrors";

/**
 * Transport > Routes (`/transport/routes`): each route as a card: which vehicle, driver and attendant run it, when it leaves in the morning and
 * in the afternoon, and its stops in order with the time it comes and goes and the monthly fee of each. A person who may change transport
 * adds and changes routes.
 */
export default function RoutesPage() {
  const can = useCan();
  const mayChange = can("transport.manage");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TransportStatus>("active");
  const [dialog, setDialog] = useState<{ route?: TransportRoute } | null>(null);
  const res = useGetRoutesQuery({ search: search.trim(), status });
  const summary = useGetTransportSummaryQuery().data?.data;
  const routes = res.data?.data.items;

  const add = (
    <Button onClick={() => setDialog({})}>
      <Plus className="size-4" aria-hidden />
      Add route
    </Button>
  );

  return (
    <div className="space-y-6">
      <StudentFormHeader title="Routes" crumbs={[{ label: "Dashboard", to: "/dashboard" }]} actions={mayChange ? add : undefined} />

      <section aria-label="About the routes" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Routes" value={summary?.routes.total ?? null} icon={RouteIcon} tone="primary" />
        <StatTile label="Stops" value={summary?.routes.stops ?? null} icon={MapPin} tone="info" />
        <StatTile label="Without a vehicle" value={summary?.routes.withoutVehicle ?? null} icon={Bus} tone={summary && summary.routes.withoutVehicle > 0 ? "warning" : "success"} />
        <StatTile label="Without a driver" value={summary?.routes.withoutDriver ?? null} icon={UserRoundCog} tone={summary && summary.routes.withoutDriver > 0 ? "warning" : "success"} />
      </section>

      <ListBar search={search} onSearch={setSearch} placeholder="Search by route or stop" status={status} onStatus={setStatus} />

      {!routes ? (
        res.error ? (
          <Card className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the routes."}</p>
            <Button variant="outline" onClick={() => void res.refetch()}>
              Try again
            </Button>
          </Card>
        ) : (
          <Skeleton className="h-64 rounded-2xl" />
        )
      ) : routes.length === 0 ? (
        <StudentsNotice icon={RouteIcon} tone="primary" title={search || status !== "active" ? "No route matches" : "No routes yet"} actions={mayChange && !search && status === "active" ? add : undefined} />
      ) : (
        <ul aria-label="Routes" className="grid gap-4 lg:grid-cols-2">
          {routes.map((r) => (
            <li key={r.id}>
              <Card className={r.isActive ? "h-full px-5 py-4" : "h-full px-5 py-4 opacity-60"} aria-label={r.name} role="group">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-section-heading truncate">{r.name}</h2>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-foreground-muted">
                      {r.morningStart && (
                        <span className="inline-flex items-center gap-1">
                          <Clock3 className="size-3.5" aria-hidden />
                          Morning {clock(r.morningStart)}
                        </span>
                      )}
                      {r.afternoonStart && <span>Afternoon {clock(r.afternoonStart)}</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!r.isActive && <Badge tone="neutral">Closed</Badge>}
                    {mayChange && (
                      <Button variant="outline" size="sm" aria-label={`Change ${r.name}`} onClick={() => setDialog({ route: r })}>
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                    )}
                  </div>
                </div>

                <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-caption-subtle">Vehicle</dt>
                    <dd className="font-semibold">{r.vehicle ? `${r.vehicle.number} · ${r.vehicle.registrationNumber}` : <span className="font-normal text-foreground-muted">None yet</span>}</dd>
                  </div>
                  <div>
                    <dt className="text-caption-subtle">Driver</dt>
                    <dd className="font-semibold">{r.driver ? `${r.driver.name} · ${r.driver.mobile}` : <span className="font-normal text-foreground-muted">None yet</span>}</dd>
                  </div>
                  <div>
                    <dt className="text-caption-subtle">Attendant</dt>
                    <dd className="font-semibold">{r.attendant ? `${r.attendant.name} · ${r.attendant.mobile}` : <span className="font-normal text-foreground-muted">None yet</span>}</dd>
                  </div>
                </dl>

                {r.stops.length > 0 ? (
                  <ol aria-label={`Stops of ${r.name}`} className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
                    {r.stops.map((s, i) => (
                      <li key={`${s.name}-${i}`} className="flex items-baseline gap-3">
                        <span className="w-5 shrink-0 text-right text-xs font-bold text-foreground-muted">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
                        <span className="shrink-0 text-xs text-foreground-muted">{[s.pickupTime && clock(s.pickupTime), s.dropTime && `back ${clock(s.dropTime)}`, s.fee !== null && `₹${s.fee.toLocaleString("en-IN")}/month`].filter(Boolean).join(" · ")}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-3 border-t border-border pt-3 text-sm text-foreground-muted">No stops yet</p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {dialog && <RouteDialog route={dialog.route} onClose={() => setDialog(null)} />}
    </div>
  );
}
