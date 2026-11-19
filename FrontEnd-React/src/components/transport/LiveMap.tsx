import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./liveMap.css";
import type { LiveVehicle } from "../../types";
import { agoLabel, escapeHtml, standing, type Stamped } from "../../utils/tracking";

/**
 * The map tiles come from OpenStreetMap by default. Their own server is for light use only: set VITE_MAP_TILE_URL (and the credit line in
 * VITE_MAP_ATTRIBUTION) to a tile host with a free key when the school really uses it (.env.example).
 */
const TILE_URL: string = import.meta.env.VITE_MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION: string = import.meta.env.VITE_MAP_ATTRIBUTION ?? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Where the map opens when nothing has reported yet: the middle of India, zoomed out. */
const INDIA: [number, number] = [22.5, 79];

export interface MapVehicle {
  item: LiveVehicle;
  stamped: Stamped;
}

/** A bus pin: a coloured disc with an arrow that turns to the heading, and the vehicle's number under it. Green while live, grey when offline. */
function pinOf(number: string, live: boolean, heading: number | null, selected: boolean): L.DivIcon {
  const colour = live ? "var(--color-success)" : "var(--color-foreground-muted)";
  const arrow = heading == null ? "" : `<span class="bus-arrow" style="transform:rotate(${heading}deg)"></span>`;
  return L.divIcon({
    className: `bus-marker${selected ? " bus-marker-selected" : ""}`,
    html: `<span class="bus-pin" style="background:${colour}">${arrow}<span class="bus-dot"></span></span><span class="bus-label">${escapeHtml(number)}</span>`,
    iconSize: [48, 46],
    iconAnchor: [24, 15],
    popupAnchor: [0, -14],
  });
}

/** Moves the map to the chosen vehicle, and fits all of them the first time there are any (or when asked). */
function Camera({ vehicles, selectedId, fitSignal, follow }: { vehicles: MapVehicle[]; selectedId: string | null; fitSignal: number; follow: boolean }) {
  const map = useMap();
  const first = vehicles.length > 0;

  useEffect(() => {
    if (!first) return;
    const points = vehicles.map((v) => [v.stamped.position.lat, v.stamped.position.lng] as [number, number]);
    if (points.length === 1) map.setView(points[0], 15);
    else map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 16 });
    // Only when the first vehicle appears or the person asks (the Fit button): never while vehicles move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, fitSignal, map]);

  // A parent follows one bus: when it drives out of the picture the map goes after it (the school's map stays where the person left it).
  const lead = follow ? vehicles[0]?.stamped.position : undefined;
  useEffect(() => {
    if (lead && !map.getBounds().contains([lead.lat, lead.lng])) map.panTo([lead.lat, lead.lng]);
  }, [lead?.lat, lead?.lng, map]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const chosen = vehicles.find((v) => v.item.vehicleId === selectedId);
    if (chosen) map.flyTo([chosen.stamped.position.lat, chosen.stamped.position.lng], Math.max(map.getZoom(), 15), { duration: 0.8 });
    // Only when the choice changes, not on every position.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, map]);

  return null;
}

/** The live map: every vehicle that has reported, moving as each new position arrives. */
export function LiveMap({
  vehicles,
  liveWithinSeconds,
  now,
  selectedId,
  onSelect,
  fitSignal,
  follow = false,
}: {
  vehicles: MapVehicle[];
  liveWithinSeconds: number;
  /** Re-read by the page every few seconds so ages and the live/offline colour keep up. */
  now: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  fitSignal: number;
  /** Keep the first vehicle in view as it moves (a parent following their child's bus). */
  follow?: boolean;
}) {
  const icons = useMemo(
    () =>
      new Map(
        vehicles.map((v) => {
          const { status } = standing(v.stamped, liveWithinSeconds, now);
          return [v.item.vehicleId, pinOf(v.item.number, status === "live", v.stamped.position.heading, v.item.vehicleId === selectedId)] as const;
        }),
      ),
    [vehicles, liveWithinSeconds, now, selectedId],
  );

  return (
    <MapContainer center={INDIA} zoom={5} scrollWheelZoom className="h-full min-h-[22rem] w-full rounded-[var(--radius-card)]" aria-label="Map of the school's vehicles">
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} maxZoom={19} />
      <Camera vehicles={vehicles} selectedId={selectedId} fitSignal={fitSignal} follow={follow} />
      {vehicles.map((v) => {
        const { status, ageSeconds } = standing(v.stamped, liveWithinSeconds, now);
        const p = v.stamped.position;
        return (
          <Marker key={v.item.vehicleId} position={[p.lat, p.lng]} icon={icons.get(v.item.vehicleId)} eventHandlers={{ click: () => onSelect(v.item.vehicleId) }}>
            <Popup>
              <div className="space-y-0.5 text-sm">
                <p className="font-bold">{v.item.number}</p>
                <p className="text-xs text-foreground-muted">{v.item.registrationNumber}</p>
                <p>
                  {status === "live" ? "Live" : "Offline"}, {agoLabel(ageSeconds)}
                </p>
                <p>Speed: {p.speedKmph == null ? "not known" : `${Math.round(p.speedKmph)} km/h`}</p>
                {v.item.driver && (
                  <p>
                    Driver: {v.item.driver.name} ({v.item.driver.mobile})
                  </p>
                )}
                {v.item.routes.length > 0 && <p>Route: {v.item.routes.join(", ")}</p>}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
