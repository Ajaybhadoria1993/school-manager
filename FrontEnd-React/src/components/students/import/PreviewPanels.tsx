import { useState } from "react";
import { Columns3, Download, FolderTree, Info, MousePointerClick, Plus, X } from "lucide-react";
import { STATES } from "../../../constants/schoolOptions";
import { BLOOD_GROUPS, CATEGORIES, GENDERS } from "../../../constants/students";
import { DISABILITIES, RELIGIONS } from "../../../constants/studentFields";
import { cn } from "../../../utils/helpers";
import { fieldDef, missingLabel, type ImportField } from "../../../utils/studentImport";
import type { AcademicStructure } from "../../../types";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";

/** The one value for every row of an added column, in the box its detail needs (a list, a day, or text). */
function ValueBox({ field, value, onChange, structure }: { field: ImportField; value: string; onChange: (value: string) => void; structure: AcademicStructure }) {
  const input = fieldDef(field).input;
  const lists: Partial<Record<typeof input, readonly string[]>> = {
    state: STATES,
    gender: GENDERS,
    class: structure.classes.map((c) => c.name),
    bloodGroup: BLOOD_GROUPS,
    category: CATEGORIES,
    relation: ["Guardian", "Other"],
    religion: RELIGIONS,
    disability: DISABILITIES,
    yesNo: ["Yes", "No"],
  };
  const list = lists[input];
  if (list) return <Select aria-label={`${fieldDef(field).label} for every row`} placeholder="Value for every row" value={value} options={list} onChange={onChange} />;
  return (
    <Input
      aria-label={`${fieldDef(field).label} for every row`}
      type={input === "date" ? "date" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={input === "date" ? undefined : "Value for every row (optional)"}
    />
  );
}

/**
 * A new column for the whole file: which detail, and one value for every row (it can be left empty and typed in the table). Used for a
 * detail the file has no column for (the State of a school whose sheet has none) and from the Add column button.
 */
export function AddColumnForm({
  fields,
  structure,
  onAdd,
  onCancel,
}: {
  fields: ImportField[];
  structure: AcademicStructure;
  onAdd: (field: ImportField, value: string) => void;
  onCancel?: () => void;
}) {
  const [field, setField] = useState<ImportField>(fields[0]);
  const [value, setValue] = useState("");
  const current = fields.includes(field) ? field : fields[0];
  if (!current) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-[13rem_minmax(0,16rem)_auto] sm:items-center">
      <Select
        aria-label="The detail of the new column"
        value={current}
        options={fields.map((f) => ({ value: f, label: missingLabel(f) }))}
        onChange={(next) => {
          setField(next as ImportField);
          setValue("");
        }}
      />
      <ValueBox field={current} value={value} onChange={setValue} structure={structure} />
      <div className="flex items-center gap-2">
        <Button
          onClick={() => {
            onAdd(current, value);
            setValue("");
          }}
        >
          <Plus className="size-4" aria-hidden />
          Add column
        </Button>
        {onCancel && (
          <Button variant="ghost" className="px-2.5" aria-label="Close" onClick={onCancel}>
            <X className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * What every student needs and the file has no column for (red: no row can be uploaded without it), with the way to add it for every
 * row at once.
 */
export function MissingColumns({ missing, structure, onAdd }: { missing: ImportField[]; structure: AcademicStructure; onAdd: (field: ImportField, value: string) => void }) {
  const names = missing.map(missingLabel).join(", ");
  return (
    <div className="fade-in rounded-2xl border-2 border-danger/60 bg-danger-soft/60 p-4 sm:p-5">
      <p className="flex items-center gap-2 text-sm font-bold text-danger">
        <Columns3 className="size-4" aria-hidden />
        Missing in your file: {names}
      </p>
      <p className="mt-1 text-sm text-foreground">Every student needs {missing.length === 1 ? "it" : "them"}. Add the column here (one value for every row, changeable in the table):</p>
      <div className="mt-3">
        <AddColumnForm fields={missing} structure={structure} onAdd={onAdd} />
      </div>
    </div>
  );
}

/**
 * What only the school's own form needs and rows of the file lack (amber: the students are uploaded all the same), said once for the
 * whole file with how many rows lack each, instead of on every row. A detail the file has no column for at all can be added for every
 * row (`addable`), in a fold so it does not take the room of the table.
 */
export function SchoolNeedsPanel({
  lacking,
  addable,
  structure,
  onAdd,
}: {
  lacking: { label: string; rows: number }[];
  addable: ImportField[];
  structure: AcademicStructure;
  onAdd: (field: ImportField, value: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="fade-in rounded-2xl border border-warning-line bg-warning-soft px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="flex items-center gap-2 text-sm font-bold text-warning">
          <Info className="size-4" aria-hidden />
          Your school also wants:
        </p>
        <ul className="flex flex-wrap gap-1.5" aria-label="Missing in some rows">
          {lacking.map((l) => (
            <li key={l.label} className="rounded-md bg-surface px-2 py-0.5 text-xs font-semibold text-foreground ring-1 ring-inset ring-warning-line">
              {l.label} <span className="font-normal text-foreground-muted">· {l.rows} row{l.rows === 1 ? "" : "s"}</span>
            </li>
          ))}
        </ul>
        {addable.length > 0 && (
          <button type="button" onClick={() => setAdding((a) => !a)} className="ml-auto cursor-pointer text-sm font-semibold text-primary-deep hover:underline">
            {adding ? "Close" : "Add one for every row"}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-foreground-muted">Not needed to upload: the students are added without them, to fill in later on each student's page.</p>
      {adding && addable.length > 0 && (
        <div className="mt-3">
          <AddColumnForm fields={addable} structure={structure} onAdd={onAdd} onCancel={() => setAdding(false)} />
        </div>
      )}
    </div>
  );
}

/** Class names of the file that are no class of the school: each can be changed, in every row at once, to one of the school's. */
export function ClassFix({ values, structure, onReplace }: { values: { value: string; rows: number }[]; structure: AcademicStructure; onReplace: (from: string, to: string) => void }) {
  const [picks, setPicks] = useState<Record<string, string>>({});
  const options = structure.classes.map((c) => ({ value: c.name, label: c.name }));
  return (
    <div className="fade-in rounded-2xl border border-warning-line bg-warning-soft p-4 sm:p-5">
      <p className="flex items-center gap-2 text-sm font-bold text-warning">
        <FolderTree className="size-4" aria-hidden />
        {values.length === 1 ? "One class of the file is" : `${values.length} classes of the file are`} not in your school
      </p>
      <p className="mt-1 text-sm text-foreground">Pick the class each one means: every row with it changes at once.</p>
      <ul className="mt-3 space-y-2">
        {values.map((v) => (
          <li key={v.value} className="grid items-center gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,14rem)_auto]">
            <span className="min-w-0 truncate text-sm">
              <span className="font-bold text-foreground">"{v.value}"</span>{" "}
              <span className="text-foreground-muted">
                · {v.rows} row{v.rows === 1 ? "" : "s"}
              </span>
            </span>
            <Select aria-label={`The class "${v.value}" means`} placeholder="Pick a class" value={picks[v.value] ?? ""} options={options} onChange={(next) => setPicks((p) => ({ ...p, [v.value]: next }))} />
            <Button variant="outline" className="justify-self-start" disabled={!picks[v.value]} onClick={() => onReplace(v.value, picks[v.value])}>
              Change {v.rows === 1 ? "it" : `all ${v.rows}`}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type RowFilter = "all" | "bad" | "good";

/** Above the table: which rows to show (all, the ones to fix, the ready ones), Add column, and the rows to fix as a file. */
export function PreviewToolbar({
  filter,
  onFilter,
  counts,
  onAddColumn,
  addOpen,
  onDownloadProblems,
  onAddRows,
}: {
  filter: RowFilter;
  onFilter: (filter: RowFilter) => void;
  counts: Record<RowFilter, number>;
  onAddColumn: () => void;
  addOpen: boolean;
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
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors",
              filter === tab.key ? "bg-primary-soft text-primary-deep" : "text-foreground-muted hover:text-foreground"
            )}
          >
            {tab.label}
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
        <Button variant={addOpen ? "secondary" : "outline"} size="sm" onClick={onAddColumn} aria-expanded={addOpen}>
          <Plus className="size-3.5" aria-hidden />
          Add column
        </Button>
      </div>
    </div>
  );
}

/** One line under the toolbar while nothing needs attention: how the table works. */
export function GridHint() {
  return (
    <p className="flex items-start gap-2 text-xs text-foreground-muted">
      <MousePointerClick className="mt-px size-3.5 shrink-0 text-primary" aria-hidden />
      Red boxes need a fix: click one and type. Only the Ready rows are uploaded.
    </p>
  );
}
