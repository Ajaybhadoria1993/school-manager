import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Bus, Phone } from "lucide-react";
import { useNow } from "../../hooks/useNow";
import { useGetChildBusQuery } from "../../redux/api/parentApi";
import type { ChildBus as ChildBusData, LiveVehicle } from "../../types";
import { getApiError } from "../../utils/apiErrors";
import { agoLabel } from "../../utils/tracking";
import { clock } from "../../utils/transport";
import { Badge } from "../ui/Badge";
import { Card } from "../ui/Card";
import { Skeleton } from "../ui/Skeleton";

// The map library is large and only a child with a bus that is out needs it.
const LiveMap = lazy(() => import("../transport/LiveMap").then((m) => ({ default: m.LiveMap })));

/** How often the page asks where the bus is while it can be followed (the driver's phone sends every few seconds). */
const ASK_EVERY_MS = 10_000;
/** The server calls a bus live while it reported within this many seconds; the page repeats it for the map's colour. */
const LIVE_WITHIN_SECONDS = 120;

/** What the bus is doing, in words and in a colour, from what the school's server said. */
function statusOf(bus: ChildBusData): { tone: "success" | "neutral" | "warning"; label: string; detail: string } {
  const t = bus.tracking;
  if (!t?.enabled) return { tone: "neutral", label: "Tracking is off", detail: "The school has not turned on live tracking for this bus." };
  if (t.live) return { tone: "success", label: "On the way", detail: t.live.speedKmph == null ? `Updated ${agoLabel(t.live.ageSeconds)}` : `${Math.round(t.live.speedKmph)} km/h · updated ${agoLabel(t.live.ageSeconds)}` };
  if (t.lastSeenSeconds == null) return { tone: "neutral", label: "Not started", detail: "The driver has not started a trip yet." };
  return { tone: "warning", label: "Not running now", detail: `Last seen ${agoLabel(t.lastSeenSeconds)}.` };
}

/**
 * The child's school bus, for their parent (docs/transport.md): the route, the stop the child boards at and its times, the vehicle and who drives
 * it, and, while the bus is out with its driver's phone on, a map that follows it. The page asks again every few seconds only while the bus can be
 * followed. Where the bus is parked when no trip runs is never given.
 */
export function ChildBus({ childId }: { childId: string }) {
  const [every, setEvery] = useState(0);
  const res = useGetChildBusQuery(childId, { pollingInterval: every, skipPollingIfUnfocused: true });
  const bus = res.data?.data;
  const followable = !!bus?.assigned && !!bus.tracking?.enabled;
  useEffect(() => setEvery(followable ? ASK_EVERY_MS : 0), [followable]);
  const now = useNow(res.data);

  const live = bus?.tracking?.live ?? null;
  const onMap = useMemo(() => {
    if (!bus?.assigned || !live) return [];
    const item: LiveVehicle = {
      vehicleId: "child-bus",
      number: bus.vehicle?.number ?? "Bus",
      registrationNumber: bus.vehicle?.registrationNumber ?? "",
      type: "bus",
      routes: bus.route ? [bus.route.name] : [],
      driver: null,
      position: null,
    };
    // The page learned of this position when it read the answer, so its age keeps growing on screen between reads.
    return [{ item, stamped: { position: { ...live, accuracy: null, status: "live" as const }, at: res.fulfilledTimeStamp ?? Date.now() } }];
  }, [bus, live, res.fulfilledTimeStamp]);

  return (
    <section aria-label="School bus" className="space-y-3">
      <h2 className="text-section-heading flex items-center gap-2">
        <Bus className="size-5 text-primary" aria-hidden />
        School bus
      </h2>
      {res.isLoading ? (
        <Skeleton className="h-32 rounded-2xl" />
      ) : !bus ? (
        <Card className="px-5 py-8 text-center text-sm text-danger">{getApiError(res.error)?.message ?? "Could not load the school bus."}</Card>
      ) : !bus.assigned ? (
        <Card className="px-5 py-8 text-center text-sm text-foreground-muted">Your child is not on a school bus route. If they should be, please ask the school.</Card>
      ) : (
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge tone={statusOf(bus).tone}>{statusOf(bus).label}</Badge>
            <p className="text-sm text-foreground-secondary">{statusOf(bus).detail}</p>
          </div>

          {onMap.length > 0 && (
            <div className="h-72 overflow-hidden rounded-[var(--radius-card)]">
              <Suspense fallback={<Skeleton className="h-full rounded-2xl" />}>
                <LiveMap vehicles={onMap} liveWithinSeconds={LIVE_WITHIN_SECONDS} now={now} selectedId={null} onSelect={() => undefined} fitSignal={0} follow />
              </Suspense>
            </div>
          )}

          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-caption-subtle">Route</dt>
              <dd className="font-semibold">{bus.route!.name}</dd>
            </div>
            <div>
              <dt className="text-caption-subtle">Bus</dt>
              <dd className="font-semibold">{bus.vehicle ? `${bus.vehicle.number} · ${bus.vehicle.registrationNumber}` : <span className="font-normal text-foreground-muted">Not decided yet</span>}</dd>
            </div>
            <div>
              <dt className="text-caption-subtle">Boards at</dt>
              <dd className="font-semibold">{bus.stop ? bus.stop.name : <span className="font-normal text-foreground-muted">The school will tell you the stop</span>}</dd>
            </div>
            <div>
              <dt className="text-caption-subtle">Times</dt>
              <dd className="font-semibold">
                {bus.stop && (bus.stop.pickupTime || bus.stop.dropTime)
                  ? [bus.stop.pickupTime && `Picks up ${clock(bus.stop.pickupTime)}`, bus.stop.dropTime && `Drops ${clock(bus.stop.dropTime)}`].filter(Boolean).join(" · ")
                  : [bus.route!.morningStart && `Leaves ${clock(bus.route!.morningStart)}`, bus.route!.afternoonStart && `Back ${clock(bus.route!.afternoonStart)}`].filter(Boolean).join(" · ") || <span className="font-normal text-foreground-muted">Not given</span>}
              </dd>
            </div>
            {[
              { label: "Driver", person: bus.driver },
              { label: "Attendant", person: bus.attendant },
            ].map(({ label, person }) => (
              <div key={label}>
                <dt className="text-caption-subtle">{label}</dt>
                <dd className="font-semibold">
                  {person ? (
                    <span className="inline-flex flex-wrap items-center gap-x-2">
                      {person.name}
                      <a href={`tel:${person.mobile}`} className="inline-flex items-center gap-1 text-primary" aria-label={`Call ${person.name}`}>
                        <Phone className="size-3.5" aria-hidden />
                        {person.mobile}
                      </a>
                    </span>
                  ) : (
                    <span className="font-normal text-foreground-muted">None yet</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </section>
  );
}
