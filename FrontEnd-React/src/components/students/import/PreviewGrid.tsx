import { CircleAlert, CircleCheck, Info, Plus, Trash2 } from "lucide-react";
import { STATES } from "../../../constants/schoolOptions";
import { BLOOD_GROUPS, CATEGORIES, GENDERS } from "../../../constants/students";
import { DISABILITIES, RELIGIONS, type CustomFieldDef } from "../../../constants/studentFields";
import { cn } from "../../../utils/helpers";
import { IMPORT_FIELDS, fieldDef, type CellInput, type ImportField, type RowProblem } from "../../../utils/studentImport";
import type { AcademicStructure } from "../../../types";
import { Select } from "../../ui/Select";

const NOT_IMPORTED = "none";
const listId = (input: string) => `import-list-${input}`;

/** The suggestions a cell offers while typing (a list column: gender, class, section, state, a list of the school's own...). */
function Suggestions({ structure, custom }: { structure: AcademicStructure; custom: readonly CustomFieldDef[] }) {
  const sections = [...new Set(structure.classes.flatMap((c) => c.sections.map((s) => s.name)))];
  const lists: [string, readonly string[]][] = [
    ["gender", GENDERS],
    ["class", structure.classes.map((c) => c.name)],
    ["section", sections],
    ["state", STATES],
    ["bloodGroup", BLOOD_GROUPS],
    ["category", CATEGORIES],
    ["relation", ["Guardian", "Other"]],
    ["religion", RELIGIONS],
    ["disability", DISABILITIES],
    ["yesNo", ["Yes", "No"]],
    ...custom.filter((f) => f.type === "choice").map((f) => [f.key, f.options] as [string, readonly string[]]),
  ];
  return (
    <>
      {lists.map(([input, values]) => (
        <datalist key={input} id={listId(input)}>
          {values.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      ))}
    </>
  );
}

export interface GridRow {
  row: number;
  cells: string[];
  /** A row of the typed table with nothing in it yet. */
  blank?: boolean;
  problems: RowProblem[];
  warnings: string[];
}

/** A column's detail as the table shows it: its name, the list it suggests, what an empty box says. */
function columnInfo(key: string | null, custom: readonly CustomFieldDef[]): { label: string; list?: string; placeholder?: string } | null {
  if (!key) return null;
  const own = custom.find((f) => f.key === key);
  if (own) {
    return {
      label: own.label,
      list: own.type === "choice" ? listId(own.key) : own.type === "yesNo" ? listId("yesNo") : undefined,
      placeholder: own.type === "date" ? "DD-MM-YYYY" : own.type === "yesNo" ? "Yes or No" : undefined,
    };
  }
  const def = fieldDef(key as ImportField);
  const input: CellInput = def.input;
  return { label: def.label, list: input === "text" || input === "date" ? undefined : listId(input), placeholder: input === "date" ? "DD-MM-YYYY" : undefined };
}

/**
 * The uploaded file as a table to correct before it is uploaded, like a spreadsheet, with everything done in the table itself:
 *  - each column heading shows the file's own title and, under it, what the column was read as (green: uploaded; grey: not uploaded),
 *    a small list to change it only when it was read wrong. The "+" at the end adds a column (a detail the file lacks, or a field of
 *    the school's own);
 *  - every cell can be changed (Enter keeps the change and goes down, Escape puts it back); a list column suggests its values (gender,
 *    class, section, state...);
 *  - a box that needs a fix has a red border and says under it what is wrong; the row's Status lists the details to fix, each a button
 *    that takes the person to its box (or adds its column when the file has none). The bin removes a row from the upload.
 * The row number and the bin stay at the left while the table scrolls sideways; the headings stay on top while it scrolls down.
 */
export function PreviewGrid({
  headers,
  rows,
  byColumn,
  custom,
  structure,
  onCell,
  onRemove,
  onColumn,
  onMissing,
  onAddColumn,
}: {
  headers: string[];
  rows: GridRow[];
  /** What each column was read as: a detail of the list, a key of the school's own field, or null (not uploaded). */
  byColumn: (string | null)[];
  custom: readonly CustomFieldDef[];
  structure: AcademicStructure;
  /** `hadProblem`: the box needed a fix (the page then offers the same change for the other rows with the same value). */
  onCell: (row: number, column: number, value: string, hadProblem: boolean) => void;
  onRemove: (row: number) => void;
  onColumn: (column: number, key: string | null) => void;
  /** A detail to fix that has no column yet: the page adds it (and takes the person to the box). */
  onMissing: (field: string, row: number) => void;
  onAddColumn: () => void;
}) {
  const options = [
    { value: NOT_IMPORTED, label: "Not uploaded" },
    ...IMPORT_FIELDS.map((f) => ({ value: f.key as string, label: f.label })),
    ...custom.map((f) => ({ value: f.key, label: `${f.label} (your own)` })),
  ];

  /** Enter: keep the change and go to the same column of the next row. */
  function keyDown(e: React.KeyboardEvent<HTMLInputElement>, original: string, index: number, column: number) {
    if (e.key === "Escape") {
      e.currentTarget.value = original;
      e.currentTarget.blur();
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
      document.querySelector<HTMLInputElement>(`[data-cell="${index + 1}:${column}"]`)?.focus();
    }
  }

  /** A detail to fix: its box in this row gets the focus (scrolled into view), or its column is added. */
  function goTo(index: number, row: number, fields: string[]) {
    const column = fields.map((f) => byColumn.indexOf(f)).find((c) => c >= 0);
    if (column === undefined) {
      if (fields[0]) onMissing(fields[0], row);
      return;
    }
    const box = document.querySelector<HTMLInputElement>(`[data-cell="${index}:${column}"]`);
    box?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    box?.focus({ preventScroll: true });
  }

  return (
    <div className="max-h-[calc(100vh-14rem)] min-h-64 overflow-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
      <Suggestions structure={structure} custom={custom} />
      <table className="min-w-full border-separate border-spacing-0 text-sm" aria-label="Your file">
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 top-0 z-30 w-20 border-b border-r border-border bg-background px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-foreground-muted">
              Row
            </th>
            <th scope="col" className="sticky top-0 z-20 min-w-44 border-b border-r border-border bg-background px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-foreground-muted">
              Status
            </th>
            {headers.map((title, column) => {
              const key = byColumn[column];
              const name = title || `Column ${column + 1}`;
              return (
                <th key={column} scope="col" className={cn("sticky top-0 z-20 min-w-44 border-b border-r border-border px-2.5 py-2 text-left align-top font-normal", key ? "bg-background" : "bg-surface-muted")}>
                  <p className="truncate text-xs font-bold text-foreground" title={name}>
                    {name}
                  </p>
                  {/* What the column was read as (green: uploaded). Change it only when it was read wrong. */}
                  <div className="mt-1" title={key ? "Read as this. Change it only if that is wrong." : "Not uploaded. Choose what it is, if you want it."}>
                    <Select
                      aria-label={`What the column "${name}" is`}
                      value={key ?? NOT_IMPORTED}
                      options={options}
                      onChange={(next) => onColumn(column, next === NOT_IMPORTED || !next ? null : next)}
                      triggerClassName={cn(
                        // One line: a long name ends in "..." (the list shows it whole).
                        "h-7 whitespace-nowrap rounded-md pl-2 pr-7 text-[11px] font-semibold [&>span]:truncate",
                        key ? "border-transparent bg-success-soft text-success" : "text-foreground-muted"
                      )}
                    />
                  </div>
                </th>
              );
            })}
            <th scope="col" className="sticky top-0 z-20 min-w-40 border-b border-border bg-background px-2 py-2 align-top">
              <button
                type="button"
                onClick={onAddColumn}
                title="Add a column: a detail your file does not have, or a new field of your own"
                className="inline-flex h-9 cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg border border-dashed border-primary/50 px-3 text-xs font-bold text-primary-deep transition-colors hover:bg-primary-soft"
              >
                <Plus className="size-3.5" aria-hidden />
                Add a column
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, index) => {
            const bad = new Map<string, string[]>();
            for (const p of r.problems) for (const f of p.fields) bad.set(f, [...(bad.get(f) ?? []), p.message]);
            const ok = r.problems.length === 0 && !r.blank;
            return (
              <tr key={r.row} className="group/row">
                <td className={cn("sticky left-0 z-10 border-b border-r border-border px-2 py-1.5 align-top", r.problems.length === 0 ? "bg-surface" : "bg-danger-soft")}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-xs text-foreground-muted">{r.row}</span>
                    <button
                      type="button"
                      onClick={() => onRemove(r.row)}
                      aria-label={`Leave row ${r.row} out of the upload`}
                      title="Leave this row out"
                      className="rounded-md p-1.5 text-foreground-muted transition-colors hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/30"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </td>
                <td className={cn("max-w-56 border-b border-r border-border px-3 py-2 align-top", r.problems.length > 0 && "bg-danger-soft/40")}>
                  {r.blank ? (
                    <span className="text-xs italic text-foreground-muted">Empty: type a student in this row</span>
                  ) : ok ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-success">
                      <CircleCheck className="size-3.5" aria-hidden />
                      Ready
                    </span>
                  ) : (
                    // The details to fix: each takes the person to its box.
                    <ul className="flex flex-wrap gap-1" aria-label={`Row ${r.row} needs a fix`}>
                      {r.problems.map((p, i) => (
                        <li key={i}>
                          <button
                            type="button"
                            disabled={p.fields.length === 0}
                            onClick={() => goTo(index, r.row, p.fields)}
                            title={p.message}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-danger-soft px-1.5 py-0.5 text-[11px] font-semibold text-danger ring-1 ring-inset ring-danger/30 hover:bg-danger hover:text-white disabled:cursor-default disabled:hover:bg-danger-soft disabled:hover:text-danger"
                          >
                            <CircleAlert className="size-3 shrink-0" aria-hidden />
                            <span>
                              {p.label}
                              {p.fields.length === 0 ? `: ${p.message}` : <span className="sr-only">: {p.message}</span>}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.warnings.map((w, i) => (
                    <p key={i} className="mt-1 flex items-start gap-1.5 text-[11px] text-warning">
                      <Info className="mt-px size-3 shrink-0" aria-hidden />
                      {w}
                    </p>
                  ))}
                </td>
                {headers.map((title, column) => {
                  const key = byColumn[column];
                  const info = columnInfo(key, custom);
                  const value = r.cells[column] ?? "";
                  const messages = key ? bad.get(key) : undefined;
                  return (
                    <td key={column} className={cn("border-b border-r border-border p-0 align-top", !key && "bg-surface-muted/60")}>
                      {/* A box that needs a fix: a red border, and what is wrong under it. */}
                      <div className={cn(messages && "m-0.5 rounded-md bg-danger-soft/50 ring-2 ring-inset ring-danger")}>
                        <input
                          // A new key when the value changes from outside (an added column, the same change for other rows), so the box shows it.
                          key={`${r.row}:${column}:${value}`}
                          defaultValue={value}
                          data-cell={`${index}:${column}`}
                          data-at={`${r.row}:${column}`}
                          list={info?.list}
                          placeholder={info?.placeholder}
                          aria-label={`${title || `Column ${column + 1}`}, row ${r.row}`}
                          aria-invalid={messages ? true : undefined}
                          title={messages?.join("\n")}
                          onBlur={(e) => {
                            if (e.target.value !== value) onCell(r.row, column, e.target.value, !!messages);
                          }}
                          onKeyDown={(e) => keyDown(e, value, index, column)}
                          className={cn(
                            "h-10 w-full min-w-0 bg-transparent px-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-foreground-muted/50 focus:bg-surface focus:ring-2 focus:ring-inset focus:ring-primary/40",
                            !key && "text-foreground-muted",
                            messages && "h-9 font-semibold text-danger"
                          )}
                        />
                        {messages && <p className="px-2.5 pb-1.5 text-[11px] font-medium leading-snug text-danger">{messages.join(" · ")}</p>}
                      </div>
                    </td>
                  );
                })}
                <td className="border-b border-border" aria-hidden />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
