import { CircleAlert, Search } from "lucide-react";
import { paperWords } from "../../utils/transport";
import { cn } from "../../utils/helpers";
import type { AttentionItem, Paper, TransportStatus } from "../../types";
import { Badge } from "../ui/Badge";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";

const TONE = { ok: "success", soon: "warning", expired: "danger", missing: "neutral" } as const;

/** One paper as a pill: its name and how it stands (green valid, amber ending soon, red ended, grey not given). */
export function PaperPill({ paper }: { paper: Paper }) {
  return (
    <Badge tone={TONE[paper.status]} title={paperWords(paper)} className="h-auto min-h-6 flex-wrap gap-x-1 py-0.5 text-[11px]">
      <span className="font-bold">{paper.label}</span>
      <span className="font-medium">{paperWords(paper)}</span>
    </Badge>
  );
}

/** The papers of the school's vehicles and drivers that have ended or end within a month, nearest first (only when there are some). */
export function AttentionCard({ items, kind }: { items: AttentionItem[]; kind: "vehicle" | "driver" }) {
  const mine = items.filter((i) => i.kind === kind);
  if (mine.length === 0) return null;
  return (
    <Card aria-label="Papers to renew" className="border-warning-line bg-warning-soft/40 px-5 py-4">
      <p className="flex items-center gap-2 text-sm font-bold text-warning">
        <CircleAlert className="size-4" aria-hidden />
        {mine.length === 1 ? "1 paper to renew" : `${mine.length} papers to renew`}
      </p>
      <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {mine.map((i) => (
          <li key={`${i.id}-${i.what}`} className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold text-foreground">{i.who}</span>
            <span className="text-foreground-muted">{i.what}</span>
            <span className={cn("text-xs font-bold", i.status === "expired" ? "text-danger" : "text-warning")}>{paperWords({ status: i.status, expiry: i.expiry, daysLeft: i.daysLeft })}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The one line above a list: a search box, and chips for which to show. */
export function ListBar({
  search,
  onSearch,
  placeholder,
  status,
  onStatus,
  extra,
}: {
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  status: TransportStatus;
  onStatus: (value: TransportStatus) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1 basis-64">
        <Input icon={Search} type="search" aria-label={placeholder} placeholder={placeholder} value={search} onChange={(e) => onSearch(e.target.value)} />
      </div>
      {extra}
      <div role="radiogroup" aria-label="Show" className="inline-flex gap-1 rounded-xl border border-border bg-surface p-1 shadow-sm">
        {(["active", "inactive", "all"] as const).map((value) => (
          <label key={value} className="relative">
            <input type="radio" name="transport-status" className="peer sr-only" checked={status === value} onChange={() => onStatus(value)} />
            <span className="inline-flex h-9 cursor-pointer items-center rounded-lg px-3.5 text-sm font-semibold text-foreground-muted transition-colors peer-checked:bg-primary-soft peer-checked:text-primary-deep peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20">
              {value === "active" ? "Active" : value === "inactive" ? "Inactive" : "All"}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
