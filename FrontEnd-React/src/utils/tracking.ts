import type { LiveVehicle, VehiclePosition } from "../types";

/** Live tracking helpers: the map's words and numbers, and the private link the driver's phone keeps (it has no sign-in: the link is the proof; the calls are in redux/api/transportApi.ts). */

/** A phone below this speed (km/h) is standing still, and its compass heading is noise. */
const MOVING_KMPH = 3;

/** The Geolocation API gives metres per second (or null). The server takes kilometres per hour. */
export function kmhOf(metresPerSecond: number | null | undefined): number | null {
  if (metresPerSecond == null || !Number.isFinite(metresPerSecond) || metresPerSecond < 0) return null;
  return Math.round(metresPerSecond * 3.6 * 10) / 10;
}

/** The heading to send: only while moving, and always 0 to 359. */
export function headingOf(heading: number | null | undefined, speedKmph: number | null): number | null {
  if (heading == null || !Number.isFinite(heading) || speedKmph == null || speedKmph < MOVING_KMPH) return null;
  return Math.round(((heading % 360) + 360) % 360);
}

/** "just now", "40 sec ago", "5 min ago", "2 hr ago", "3 days ago". */
export function agoLabel(seconds: number): string {
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${Math.round(seconds)} sec ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** A position with the moment this page learned of it, so its age keeps growing on screen between pushes. */
export interface Stamped {
  position: VehiclePosition;
  /** `Date.now()` when this page received it. */
  at: number;
}

/**
 * How a position stands NOW: its age is what the server said when it sent it, plus the time since this page received it. A vehicle that
 * went quiet turns offline here without waiting for the server to say so.
 */
export function standing(stamped: Stamped, liveWithinSeconds: number, now = Date.now()): { status: VehiclePosition["status"]; ageSeconds: number } {
  const ageSeconds = Math.max(0, stamped.position.ageSeconds + Math.round((now - stamped.at) / 1000));
  return { status: stamped.position.status === "live" && ageSeconds <= liveWithinSeconds ? "live" : "offline", ageSeconds };
}

/** Escapes text for the HTML of a map marker (a vehicle's number is typed by a person). */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** The vehicles that have a position, to fit the map around. */
export const positioned = (items: LiveVehicle[], stamps: Record<string, Stamped>) =>
  items.filter((v) => stamps[v.vehicleId]).map((v) => ({ item: v, stamped: stamps[v.vehicleId] }));

// ---- the driver's link ----------------------------------------------------------------------------------------------------------------

const LINK_STORAGE = "driverTrackingLink";

/** The driver page's address carries the link after a `#`, which a browser never sends to any server or writes to a log. */
export function driverPageUrl(link: string, origin = window.location.origin): string {
  return `${origin}/driver-track#${link}`;
}

/** The link a phone should use: the one just opened (after the `#`), else the one it kept from last time. */
export function readDriverLink(hash: string, storage: Pick<Storage, "getItem" | "setItem"> | null = safeStorage()): string | null {
  const fromHash = hash.replace(/^#/, "").trim();
  if (/^[a-f\d]{24}\.[\w-]{20,}$/i.test(fromHash)) {
    try {
      storage?.setItem(LINK_STORAGE, fromHash);
    } catch {
      /* A private window: it works for this visit only. */
    }
    return fromHash;
  }
  try {
    return storage?.getItem(LINK_STORAGE) ?? null;
  } catch {
    return null;
  }
}

export function forgetDriverLink(): void {
  try {
    window.localStorage.removeItem(LINK_STORAGE);
  } catch {
    /* nothing kept */
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
