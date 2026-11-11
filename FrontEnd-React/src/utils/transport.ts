import type { Paper } from "../types";
import { formatDay } from "./academicYear";

/** What a paper says about itself, in words: "Valid till 31 Mar 2027", "Ends in 10 days", "Ended 3 days ago", "Not given". */
export function paperWords(p: Pick<Paper, "status" | "expiry" | "daysLeft">): string {
  if (p.status === "missing" || !p.expiry) return "Not given";
  const days = p.daysLeft ?? 0;
  if (p.status === "expired") return `Ended ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  if (p.status === "soon") return days === 0 ? "Ends today" : `Ends in ${days} day${days === 1 ? "" : "s"}`;
  return `Valid till ${formatDay(p.expiry)}`;
}

/** The server's word about each box: its `details` by path. */
export function fieldErrorsOf(err: unknown, get: (e: unknown) => { details?: unknown } | null): Record<string, string> {
  const details = get(err)?.details;
  const out: Record<string, string> = {};
  if (Array.isArray(details)) for (const d of details as { path?: string; message?: string }[]) if (d.path && d.message && !out[d.path]) out[d.path] = d.message;
  return out;
}

/** "07:10" as "7:10 am". */
export function clock(time: string | null): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
