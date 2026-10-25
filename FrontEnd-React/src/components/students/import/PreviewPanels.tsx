import { useState } from "react";
import { Download, MousePointerClick, Plus, Sparkles, Wand2, X } from "lucide-react";
import { cn } from "../../../utils/helpers";
import type { ColumnChoice } from "../../../utils/studentImport";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";

/** The one value for every row of an added column, in the box its detail needs (a list, a day, or text). */
function ValueBox({ choice, value, onChange }: { choice: ColumnChoice; value: string; onChange: (value: string) => void }) {
  if (choice.list) return <Select aria-label={`${choice.label} for every row`} placeholder="Same for every row (optional)" value={value} options={choice.list} onChange={onChange} />;
  return (
    <Input
      aria-label={`${choice.label} for every row`}
      type={choice.date ? "date" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={choice.date ? undefined : "Same for every row (optional)"}
    />
  );
}

/**
 * The "+" of the table: a new column, a detail the file has no column for (the State of a school whose sheet has none, a Section) or
 * one of the school's own fields, with one value for every row if wanted (or left empty to type in the table). A field the school does
 * not have yet is made here too ("Create a new field"), and gets its column at once.
 */
export function AddColumnPanel({
  choices,
  onAdd,
  onCreate,
  onClose,
}: {
  choices: ColumnChoice[];
  onAdd: (value: string, fill: string) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState(choices[0]?.value ?? "");
  const [fill, setFill] = useState("");
  const choice = choices.find((c) => c.value === picked) ?? choices[0];
  return (
    <div className="fade-in rounded-2xl border border-primary/30 bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-foreground">Add a column to the table</p>
        <button type="button" aria-label="Close" onClick={onClose} className="flex size-8 cursor-pointer items-center justify-center rounded-lg text-foreground-muted hover:bg-surface-muted">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {choice ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-[14rem_minmax(0,16rem)_auto] sm:items-center">
          <Select
            aria-label="The detail of the new column"
            value={choice.value}
            options={choices.map((c) => ({ value: c.value, label: c.label }))}
            onChange={(next) => {
              setPicked(next);
              setFill("");
            }}
          />
          <ValueBox choice={choice} value={fill} onChange={setFill} />
          <Button onClick={() => onAdd(choice.value, fill)}>
            <Plus className="size-4" aria-hidden />
            Add column
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-foreground-muted">Every detail already has a column.</p>
      )}
      <button type="button" onClick={onCreate} className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-primary-deep hover:underline">
        <Sparkles className="size-4" aria-hidden />
        Not in the list? Create a new field of your own
      </button>
    </div>
  );
}

/**
 * After a box that needed a fix is changed: the other rows with the same value in that column ("Class 8" in 4 more rows) can take the
 * same change at once.
 */
export function SameValueOffer({ heading, from, to, rows, onApply, onDismiss }: { heading: string; from: string; to: string; rows: number; onApply: () => void; onDismiss: () => void }) {
  return (
    <div className="fade-in flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-primary/30 bg-primary-soft/60 px-4 py-2.5 text-sm">
      <Wand2 className="size-4 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1 text-foreground">
        {rows} more row{rows === 1 ? " has" : "s have"} <span className="font-bold">{from ? `"${from}"` : "an empty box"}</span> in {heading}. Change{" "}
        {rows === 1 ? "it" : "them"} to{" "}
        <span className="font-bold">"{to || "(empty)"}"</span> too?
      </p>
      <Button size="sm" onClick={onApply}>
        Change {rows === 1 ? "it" : `all ${rows}`}
      </Button>
      <Button size="sm" variant="ghost" onClick={onDismiss}>
        No
      </Button>
    </div>
  );
}

export type RowFilter = "all" | "bad" | "good";

/** Above the table: which rows to show (all, the ones to fix, the ready ones) and the rows to fix as a file. */
export function PreviewToolbar({
  filter,
  onFilter,
  counts,
  onDownloadProblems,
  onAddRows,
}: {
  filter: RowFilter;
  onFilter: (filter: RowFilter) => void;
  counts: Record<RowFilter, number>;
  onDownloadProblems: () => void;
  /** Only for a table that is typed here: 10 more empty rows. */
  onAddRows?: () => void;
}) {
  const tabs: { key: RowFilter; label: string; tone: string }[] = [
    { key: "all", label: "All rows", tone: "bg-surface-muted text-foreground-muted" },
    { key: "bad", label: "Need a fix", tone: counts.bad > 0 ? "bg-danger-soft text-danger" : "bg-surface-muted text-foreground-muted" },
    { key: "good", label: "Ready", tone: "bg-success-soft text-success" },
  ];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="tablist" aria-label="Which rows to show" className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={filter === tab.key}
            onClick={() => onFilter(tab.key)}
            className={cn(
              "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors",
              filter === tab.key ? "bg-primary-soft text-primary-deep" : "text-foreground-muted hover:text-foreground"
            )}
          >
            {/* The space keeps the name read out as "Need a fix 7", not "Need a fix7". */}
            {tab.label}{" "}
            <span className={cn("rounded-full px-1.5 text-xs", tab.tone)}>{counts[tab.key]}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {counts.bad > 0 && (
          <Button variant="outline" size="sm" onClick={onDownloadProblems}>
            <Download className="size-3.5" aria-hidden />
            Rows to fix (CSV)
          </Button>
        )}
        {onAddRows && (
          <Button variant="outline" size="sm" onClick={onAddRows}>
            <Plus className="size-3.5" aria-hidden />
            Add 10 rows
          </Button>
        )}
      </div>
    </div>
  );
}

/** One line above the table: how it works. */
export function GridHint() {
  return (
    <p className="flex items-start gap-2 text-xs text-foreground-muted">
      <MousePointerClick className="mt-px size-3.5 shrink-0 text-primary" aria-hidden />
      A red box says under it what to fix: click it and type. A red label in Status takes you to its box. Only Ready rows are uploaded.
    </p>
  );
}
