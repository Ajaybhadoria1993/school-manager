import { useCallback, useEffect, useMemo, useState } from "react";
import { Bus, Maximize2, Radio, SignalZero, Smartphone } from "lucide-react";
import { Link } from "react-router";
import { LiveMap, type MapVehicle } from "../../components/transport/LiveMap";
import { StatTile } from "../../components/dashboard/school/StatTile";
import { StudentFormHeader } from "../../components/students/StudentFormHeader";
import { StudentsNotice } from "../../components/students/StudentsNotice";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import { useCan } from "../../hooks/useCan";
import { connectTracking } from "../../realtime/trackingSocket";
import { useGetLiveTrackingQuery } from "../../redux/api/transportApi";
import type { PositionPush } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { agoLabel, standing, type Stamped } from "../../utils/tracking";
import { cn } from "../../utils/helpers";

/** How often the page re-reads the clock, so "5 sec ago" and the live/offline colour keep up between pushes. */
const TICK_MS = 5_000;

/**
 * Transport > Live tracking (`/transport/tracking`): where each of the school's vehicles is now, on an OpenStreetMap map. A vehicle shows once its
 * driver opens the private link on a phone and starts the trip (the Vehicles page makes the link). The first answer is read once; after that every
 * new position arrives on the socket (the same line as the bell), and the pin glides to it. A vehicle that goes quiet turns grey on its own.
 */
export default function TrackingPage() {
  const can = useCan();
  const res = useGetLiveTrackingQuery();
  const { refetch } = res;
  const items = useMemo(() => res.data?.data.items ?? [], [res.data]);
  const liveWithin = res.data?.data.liveWithinSeconds ?? 120;

  // What the socket said, on top of what the first answer said. It is dropped whenever the page asks again, so the answer is never older.
  const [pushed, setPushed] = useState<Record<string, Stamped>>({});
  const [lineOpen, setLineOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fitSignal, setFitSignal] = useState(0);

  const answeredAt = res.fulfilledTimeStamp ?? 0;
  const known = useMemo(() => new Set(items.map((v) => v.vehicleId)), [items]);

  const onPosition = useCallback(
    (push: PositionPush) => {
      if (!known.has(push.vehicleId)) {
        void refetch(); // a vehicle that got its link after this page opened
        return;
      }
      setPushed((p) => ({ ...p, [push.vehicleId]: { position: push.position, at: Date.now() } }));
    },
    [known, refetch],
  );

  useEffect(
    () =>
      connectTracking({
        onPosition,
        onLine: setLineOpen,
        onReconnect: () => {
          setPushed({});
          void refetch();
        },
      }),
    [onPosition, refetch],
  );
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const stamps = useMemo(() => {
    const out: Record<string, Stamped> = {};
    for (const v of items) if (v.position) out[v.vehicleId] = { position: v.position, at: answeredAt };
    for (const [id, s] of Object.entries(pushed)) if (s.at >= answeredAt && known.has(id)) out[id] = s;
    return out;
  }, [items, pushed, answeredAt, known]);

  const onMap: MapVehicle[] = useMemo(() => items.filter((v) => stamps[v.vehicleId]).map((v) => ({ item: v, stamped: stamps[v.vehicleId] })), [items, stamps]);
  const liveCount = onMap.filter((v) => standing(v.stamped, liveWithin, now).status === "live").length;

  return (
    <div className="space-y-6">
      <StudentFormHeader
        title="Live tracking"
        crumbs={[{ label: "Dashboard", to: "/dashboard" }]}
        subtitle="Where the school's vehicles are right now"
        actions={
          can("transport.manage") ? (
            <Link to="/transport/vehicles">
              <Button variant="outline">
                <Smartphone className="size-4" aria-hidden />
                Driver links
              </Button>
            </Link>
          ) : undefined
        }
      />

      <section aria-label="About the vehicles" className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Vehicles with a driver link" value={res.data ? items.length : null} icon={Bus} tone="primary" />
        <StatTile label="Live now" value={res.data ? liveCount : null} icon={Radio} tone="success" />
        <StatTile label="Not reporting" value={res.data ? items.length - liveCount : null} icon={SignalZero} tone={res.data && items.length - liveCount > 0 ? "warning" : "success"} />
      </section>

      {res.isLoading ? (
        <Skeleton className="h-[32rem] rounded-2xl" />
      ) : res.error ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the live map."}</p>
          <Button variant="outline" onClick={() => void refetch()}>
            Try again
          </Button>
        </Card>
      ) : items.length === 0 ? (
        <StudentsNotice
          icon={Smartphone}
          tone="primary"
          title="No vehicle has a driver link yet"
          actions={
            can("transport.manage") ? (
              <Link to="/transport/vehicles">
                <Button>Make a driver link</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <Card className="max-h-[32rem] overflow-y-auto p-2">
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <Badge tone={lineOpen ? "success" : "warning"}>{lineOpen ? "Live line on" : "Reconnecting…"}</Badge>
              <Button variant="outline" size="sm" onClick={() => setFitSignal((n) => n + 1)} disabled={onMap.length === 0}>
                <Maximize2 className="size-4" aria-hidden />
                Fit all
              </Button>
            </div>
            <ul aria-label="Vehicles" className="space-y-1">
              {items.map((v) => {
                const stamped = stamps[v.vehicleId];
                const state = stamped ? standing(stamped, liveWithin, now) : null;
                return (
                  <li key={v.vehicleId}>
                    <button
                      type="button"
                      onClick={() => stamped && setSelectedId(v.vehicleId)}
                      disabled={!stamped}
                      aria-pressed={selectedId === v.vehicleId}
                      className={cn(
                        "w-full rounded-xl px-3 py-2 text-left transition-colors enabled:hover:bg-surface-muted disabled:cursor-default",
                        selectedId === v.vehicleId && "bg-primary-soft",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-bold text-foreground">{v.number}</span>
                        <Badge tone={state?.status === "live" ? "success" : "neutral"}>{state ? (state.status === "live" ? "Live" : "Offline") : "Not started"}</Badge>
                      </span>
                      <span className="block text-xs text-foreground-muted">
                        {state ? `${agoLabel(state.ageSeconds)}${stamped.position.speedKmph != null ? `, ${Math.round(stamped.position.speedKmph)} km/h` : ""}` : "Waiting for the driver to start"}
                      </span>
                      {(v.driver || v.routes.length > 0) && <span className="block truncate text-xs text-foreground-muted">{[v.driver?.name, v.routes.join(", ")].filter(Boolean).join(" · ")}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card className="h-[32rem] overflow-hidden p-0">
            <LiveMap vehicles={onMap} liveWithinSeconds={liveWithin} now={now} selectedId={selectedId} onSelect={setSelectedId} fitSignal={fitSignal} />
          </Card>
        </div>
      )}
    </div>
  );
}
