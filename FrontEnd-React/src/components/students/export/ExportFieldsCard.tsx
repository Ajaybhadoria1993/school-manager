import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Lock, PencilLine, Table2 } from "lucide-react";
import { CUSTOM_FIELD_TYPES, MAX_EXPORT_HEADING, type CustomFieldDef } from "../../../constants/studentFields";
import { cn } from "../../../utils/helpers";
import {
  columnIsMandatory,
  columnLetters,
  dragRow,
  infoOf,
  isTick,
  renameRow,
  setMandatory,
  stepRow,
  switchRow,
  tidyHeading,
  type FieldRow,
  type FieldsDraft,
} from "../../../utils/exportLayout";
import { Card } from "../../ui/Card";
import { Input } from "../../ui/Input";

/**
 * A bare on / off switch (the row says what it is about), a real switch for a screen reader. `tone` tells the two switches of a row
 * apart: green for "in the Excel", blue for Mandatory.
 */
function Toggle({
  checked,
  onChange,
  label,
  title = label,
  disabled,
  tone = "primary",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  /** What the pointer says; the label by default. */
  title?: string;
  disabled?: boolean;
  tone?: "primary" | "success";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60",
        checked ? (tone === "success" ? "bg-success" : "bg-primary") : "bg-border"
      )}
    >
      <span aria-hidden className={cn("inline-block size-4 rounded-full bg-surface shadow transition-transform duration-200", checked ? "translate-x-[1.125rem]" : "translate-x-0.5")} />
    </button>
  );
}

const LINKED: Record<string, string> = {
  guardianOccupation: "One setting for the father's and the mother's occupation",
  secondParent: "Mandatory: the father and the mother are both needed (a name is enough for the one without a mobile number)",
};

/** A column the software always needs (the name, the birthday, the class, the first parent): Add student asks it whatever the Excel has. */
function AlwaysAsked({ label = "Always", title }: { label?: string; title?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-foreground-muted" title={title ?? "Always needed: the software depends on it"}>
      <Lock className="size-3" aria-hidden />
      {label}
    </span>
  );
}

/**
 * The Mandatory column of a column of the Excel. It is the same setting as on Add student's form: a switch where the school decides
 * and the form asks the detail (mandatory is then in the Excel and on the form alike), else what it always is.
 */
function MandatoryCell({ draft, rowKey, onRequired }: { draft: FieldsDraft; rowKey: string; onRequired: (required: boolean) => void }) {
  const { heading, need } = infoOf(rowKey, draft.custom);
  if (need.kind === "fixed") return <AlwaysAsked label={need.label} title={need.title} />;
  const decides = (need.kind === "rule" && !isTick(need.rule)) || (need.kind === "custom" && need.field.type !== "yesNo");
  if (decides) {
    const mode = need.kind === "rule" ? draft.rules[need.rule] : need.kind === "custom" ? need.field.mode : "hidden";
    // Add student does not ask it: there is nothing to make mandatory until the form asks it (Manage fields > Add student form).
    if (mode === "hidden") {
      return (
        <span className="text-xs text-foreground-muted/60" title="Add student does not ask this detail">
          —
        </span>
      );
    }
    const required = mode === "required";
    return (
      <span className="flex items-center gap-1.5" title={need.kind === "rule" ? LINKED[need.rule] : undefined}>
        <Toggle
          checked={required}
          onChange={onRequired}
          label={`${heading} mandatory`}
          title={required ? "Mandatory on Add student and in the Excel. Press to make it optional in both." : "Press to make it mandatory on Add student and in the Excel."}
        />
        <span className={cn("text-xs font-bold transition-colors", required ? "text-primary-deep" : "text-foreground-muted")}>{required ? "Mandatory" : "Optional"}</span>
      </span>
    );
  }
  if (need.kind === "always") return <AlwaysAsked />;
  if (need.kind === "auto") {
    return (
      <span className="text-xs font-bold text-foreground-muted" title="Made by the software">
        Auto
      </span>
    );
  }
  return (
    <span className="text-xs font-semibold text-foreground-muted/80" title={need.kind === "optional" ? "Always optional on the form" : "A yes / no tick"}>
      Optional
    </span>
  );
}

/**
 * One grid for the header and the rows: grip, letter, column (its heading in the file), In the Excel, Mandatory, place. On a phone the
 * Mandatory and the arrows go under the column.
 */
const GRID = "grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 sm:grid-cols-[auto_auto_minmax(0,1fr)_3.25rem_6.75rem_3.75rem]";
const STEP = "flex size-7 cursor-pointer items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-25";
const typeLabel = (field: CustomFieldDef) => CUSTOM_FIELD_TYPES.find((t) => t.type === field.type)?.label ?? "";

/**
 * The Excel's columns, as an accordion: closed it is one line (how many columns, how many mandatory; the preview below shows the file),
 * open it is the list, in the order of the file (A, B, C for the ones that are in it), two lists side by side on a wide screen. A row
 * shows the column's heading in the file (press it to type your own), whether it is in the file (out: the row stays where it is,
 * dimmed), Mandatory (the same setting as on Add student: one place changes both) and its place (↑ ↓, or drag the row). What Add student
 * asks is arranged on its own, in Manage fields; a mandatory detail is in both.
 */
export function ExportFieldsCard({
  draft,
  problems,
  onChange,
  open: wanted,
  onOpenChange,
  collapsible = true,
}: {
  draft: FieldsDraft;
  problems: Record<string, string>;
  onChange: (draft: FieldsDraft) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** False where the list is always open and has no arrow. */
  collapsible?: boolean;
}) {
  const open = wanted || !collapsible;
  const [armed, setArmed] = useState<string | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [moved, setMoved] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ key: string; before: string } | null>(null);
  const editBox = useRef<HTMLInputElement>(null);

  // A field that just moved shows where it went, for a moment.
  useEffect(() => {
    if (!moved) return;
    const t = window.setTimeout(() => setMoved(null), 700);
    return () => window.clearTimeout(t);
  }, [moved]);
  useEffect(() => {
    if (editing) editBox.current?.select();
  }, [editing]);

  const letters = useMemo(() => {
    const out: Record<string, string> = {};
    let n = 0;
    for (const r of draft.rows) if (r.on) out[r.key] = columnLetters(n++);
    return out;
  }, [draft.rows]);
  const onCount = draft.rows.filter((r) => r.on).length;
  const firstOn = draft.rows.findIndex((r) => r.on);
  const lastOn = draft.rows.reduce((last, r, i) => (r.on ? i : last), -1);
  const half = Math.ceil(draft.rows.length / 2);

  const step = (key: string, dir: -1 | 1) => {
    onChange(stepRow(draft, key, dir));
    setMoved(key);
  };

  const row = (r: FieldRow, i: number) => {
    const info = infoOf(r.key, draft.custom);
    const own = info.need.kind === "custom" ? info.need.field : null;
    const problem = r.on ? problems[r.key] : undefined;
    const inputId = `export-heading-${r.key}`;
    const renamed = tidyHeading(r.heading) !== info.heading;
    const mandatory = columnIsMandatory(draft, r.key);
    // Under the heading: where the detail belongs (the group of the list, or the kind of an own field).
    const sub = own ? `Your own field · ${typeLabel(own)}${own.type === "choice" ? ` (${own.options.length})` : ""}` : info.group;
    const subTitle = [sub, renamed ? `Usual heading: ${info.heading}` : ""].filter(Boolean).join(" · ");
    return (
      <li
        key={r.key}
        draggable={r.on && armed === r.key}
        onPointerDown={(e) => setArmed(r.on && !(e.target as HTMLElement).closest("input, textarea, button") ? r.key : null)}
        onPointerUp={() => setArmed(null)}
        onDragStart={(e) => {
          setDragging(i);
          e.dataTransfer.effectAllowed = "move";
          // Firefox starts a drag only when something is set.
          e.dataTransfer.setData("text/plain", r.key);
        }}
        onDragOver={(e) => {
          if (dragging === null) return;
          e.preventDefault();
          if (over !== i) setOver(i);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragging !== null && dragging !== i) {
            onChange(dragRow(draft, dragging, i));
            setMoved(draft.rows[dragging].key);
          }
          setDragging(null);
          setOver(null);
        }}
        onDragEnd={() => {
          setDragging(null);
          setOver(null);
          setArmed(null);
        }}
        data-on={r.on || undefined}
        className={cn(
          GRID,
          "rounded-lg border px-2.5 py-1.5 transition-[opacity,background-color,border-color,box-shadow] duration-300",
          r.on ? "cursor-grab border-border bg-surface hover:border-primary/30 hover:shadow-sm active:cursor-grabbing" : "border-dashed border-border bg-background opacity-60 hover:opacity-90",
          problem && "border-danger/50 bg-danger-soft/30",
          dragging === i && "opacity-40",
          over === i && dragging !== null && dragging !== i && "border-primary ring-2 ring-primary/20",
          moved === r.key && "border-primary/50 bg-primary-soft/50"
        )}
      >
        <GripVertical className={cn("size-4", r.on ? "text-foreground-muted/60" : "text-transparent")} aria-hidden />
        <span
          className={cn(
            "flex h-6 min-w-6 items-center justify-center rounded-md px-1 font-mono text-[11px] font-bold transition-colors",
            r.on ? "bg-navy text-white" : "bg-surface-muted text-foreground-muted"
          )}
          title={r.on ? `Column ${letters[r.key]} of the Excel` : "Not in the Excel"}
        >
          {r.on ? letters[r.key] : "–"}
        </span>
        <span className="min-w-0">
          {editing?.key === r.key ? (
            <>
              <label htmlFor={inputId} className="sr-only">
                Heading of {info.heading} in the Excel
              </label>
              <Input
                ref={editBox}
                id={inputId}
                className="h-8 cursor-text"
                value={r.heading}
                maxLength={MAX_EXPORT_HEADING + 10}
                onChange={(e) => onChange(renameRow(draft, r.key, e.target.value))}
                onBlur={() => setEditing(null)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setEditing(null);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    onChange(renameRow(draft, r.key, editing.before));
                    setEditing(null);
                  }
                }}
                aria-invalid={!!problem}
                aria-describedby={problem ? `${inputId}-error` : undefined}
              />
            </>
          ) : (
            <button
              type="button"
              disabled={!r.on}
              onClick={() => setEditing({ key: r.key, before: r.heading })}
              aria-label={`Rename ${info.heading} in the Excel`}
              title="Press to type your own heading for the Excel"
              className="group flex min-w-0 max-w-full cursor-text items-center gap-1 rounded text-left text-sm font-semibold text-foreground hover:text-primary-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-default disabled:hover:text-foreground"
            >
              <span className="truncate">{r.heading || <span className="italic text-danger">No heading</span>}</span>
              {r.on && <PencilLine className="size-3 shrink-0 text-foreground-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />}
            </button>
          )}
          {problem ? (
            <span id={`${inputId}-error`} role="alert" className="block truncate text-[11px] font-medium text-danger">
              {problem}
            </span>
          ) : (
            editing?.key !== r.key && (
              <span data-testid="column-group" title={subTitle} className={cn("block truncate text-[11px]", own ? "font-semibold text-primary-deep" : "text-foreground-muted")}>
                {sub}
              </span>
            )
          )}
        </span>
        <span className="flex justify-center">
          <Toggle
            checked={r.on}
            onChange={(on) => onChange(switchRow(draft, r.key, on))}
            label={`${info.heading} in the Excel`}
            title={
              info.locked
                ? "Always in the Excel"
                : mandatory
                  ? "Mandatory: it is always in the Excel. Make it optional first."
                  : r.on
                    ? "Take this column out of the Excel (Add student is not changed)"
                    : "Put this column in the Excel (Add student is not changed)"
            }
            disabled={mandatory}
            tone="success"
          />
        </span>
        <span className="col-start-3 sm:col-start-auto">
          <MandatoryCell draft={draft} rowKey={r.key} onRequired={(required) => onChange(setMandatory(draft, r.key, required))} />
        </span>
        <span className="col-start-4 flex justify-end sm:col-start-auto">
          <button type="button" aria-label={`Move ${info.heading} up`} title="One column earlier in the Excel" disabled={!r.on || i <= firstOn} onClick={() => step(r.key, -1)} className={STEP}>
            <ChevronUp className="size-4" aria-hidden />
          </button>
          <button type="button" aria-label={`Move ${info.heading} down`} title="One column later in the Excel" disabled={!r.on || i >= lastOn} onClick={() => step(r.key, 1)} className={STEP}>
            <ChevronDown className="size-4" aria-hidden />
          </button>
        </span>
      </li>
    );
  };

  const header = (className?: string) => (
    <div aria-hidden className={cn(GRID, "hidden px-2.5 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-foreground-muted sm:grid", className)}>
      <span className="size-4" />
      <span className="min-w-6" />
      <span>Column in the Excel</span>
      <span className="text-center">In Excel</span>
      <span>Mandatory</span>
      <span className="text-right">Place</span>
    </div>
  );

  const mandatoryCount = draft.rows.filter((r) => r.on && columnIsMandatory(draft, r.key)).length;

  return (
    <Card className="overflow-hidden" role="region" aria-label="Excel columns">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
        {/* The title opens and closes the columns too (a bigger target than the arrow); the arrow is the control a keyboard uses. */}
        <div aria-hidden onClick={() => collapsible && onOpenChange(!open)} className={cn("flex min-w-0 flex-1 select-none items-center gap-3", collapsible && "cursor-pointer")}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
            <Table2 className="size-4.5" />
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2 text-base font-bold text-foreground">
              Excel columns
              <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-bold text-primary-deep">
                {onCount} in the Excel · {draft.rows.length - onCount} out
              </span>
            </span>
            <span className="block truncate text-xs text-foreground-muted">
              The file you download and upload · {mandatoryCount} mandatory{draft.custom.length > 0 ? ` · ${draft.custom.length} of your own` : ""}
            </span>
          </span>
        </div>
        {collapsible && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls="export-fields"
            aria-label={open ? "Hide the columns" : "Show the columns"}
            title={open ? "Hide the columns" : "Show the columns to change them"}
            onClick={() => onOpenChange(!open)}
            className={cn(
              "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
              open ? "border-primary/30 bg-primary-soft text-primary-deep" : "border-border bg-surface text-foreground-muted hover:border-primary/30 hover:text-primary-deep"
            )}
          >
            <ChevronDown className={cn("size-5 transition-transform duration-300", open && "rotate-180")} aria-hidden />
          </button>
        )}
      </div>

      {/* Opens and closes smoothly (the rows' height animates); while closed it is out of the way of the keyboard and screen readers. */}
      <div id="export-fields" className={cn("grid transition-[grid-template-rows] duration-300 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")} inert={!open}>
        <div className="overflow-hidden">
          <div className="grid gap-x-6 gap-y-1.5 border-t border-border px-4 pb-4 pt-3 sm:px-5 sm:pb-5 xl:grid-cols-2">
            <div>
              {header()}
              <ol aria-label="Columns" className="space-y-1.5">
                {draft.rows.slice(0, half).map((r, i) => row(r, i))}
              </ol>
            </div>
            <div>
              {header("sm:hidden xl:grid")}
              <ol aria-label="More columns" className="space-y-1.5" start={half + 1}>
                {draft.rows.slice(half).map((r, i) => row(r, half + i))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
