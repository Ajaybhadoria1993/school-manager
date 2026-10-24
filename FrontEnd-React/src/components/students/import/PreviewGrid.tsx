import { ChevronDown, CircleAlert, CircleCheck, Info, Trash2 } from "lucide-react";
import { STATES } from "../../../constants/schoolOptions";
import { BLOOD_GROUPS, CATEGORIES, GENDERS } from "../../../constants/students";
import { DISABILITIES, RELIGIONS } from "../../../constants/studentFields";
import { cn } from "../../../utils/helpers";
import { IMPORT_FIELDS, fieldDef, type CellInput, type ImportField, type RowProblem } from "../../../utils/studentImport";
import type { AcademicStructure } from "../../../types";

const NOT_IMPORTED = "none";
const FIELD_OPTIONS = [{ value: NOT_IMPORTED, label: "Not uploaded" }, ...IMPORT_FIELDS.map((f) => ({ value: f.key, label: f.label }))];
const listId = (input: CellInput) => `import-list-${input}`;

/** The suggestions a cell offers while typing (a list column: gender, class, section, state...). */
function Suggestions({ structure }: { structure: AcademicStructure }) {
  const sections = [...new Set(structure.classes.flatMap((c) => c.sections.map((s) => s.name)))];
  const lists: [CellInput, readonly string[]][] = [
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

/**
 * The uploaded file as a table to correct before it is uploaded, like a spreadsheet:
 *  - each column heading shows the file's own title and, under it, what the column was read as (green: uploaded; grey: not uploaded).
 *    It is a plain list, to change only when it was read wrong ("Not uploaded" leaves it out). A detail is in one column
 *    only: choosing it for another column moves it there;
 *  - every cell can be changed (Enter keeps the change and goes down, Escape puts it back); a list column suggests its values (gender,
 *    class, section, state...);
 *  - a cell with a problem is red, its message is on it (hover) and in the row's Status, and the bin removes a row from the upload.
 * The row number and the bin stay at the left while the table scrolls sideways; the headings stay on top while it scrolls down.
 */
export function PreviewGrid({
  headers,
  rows,
  byColumn,
  structure,
  onCell,
  onRemove,
  onColumn,
}: {
  headers: string[];
  rows: GridRow[];
  byColumn: (ImportField | null)[];
  structure: AcademicStructure;
  onCell: (row: number, column: number, value: string) => void;
  onRemove: (row: number) => void;
  onColumn: (column: number, field: ImportField | null) => void;
}) {
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

  return (
    <div className="max-h-[calc(100vh-14rem)] min-h-64 overflow-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
      <Suggestions structure={structure} />
      <table className="min-w-full border-separate border-spacing-0 text-sm" aria-label="Your file">
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 top-0 z-30 w-20 border-b border-r border-border bg-background px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-foreground-muted">
              Row
            </th>
            <th scope="col" className="sticky top-0 z-20 min-w-60 border-b border-r border-border bg-background px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-foreground-muted">
              Status
            </th>
            {headers.map((title, column) => {
              const field = byColumn[column];
              const name = title || `Column ${column + 1}`;
              return (
                <th key={column} scope="col" className={cn("sticky top-0 z-20 min-w-44 border-b border-r border-border px-2.5 py-2 text-left align-top font-normal", field ? "bg-background" : "bg-surface-muted")}>
                  <p className="truncate text-xs font-bold text-foreground" title={name}>
                    {name}
                  </p>
                  {/* What the column was read as: green when it is uploaded, grey when not. A plain list (one press opens it), to change
                      only when it was read wrong. */}
                  <span className="relative mt-1 inline-flex max-w-full items-center" title={field ? `Uploaded as ${fieldDef(field).label}. Change it only if that is wrong.` : "Not uploaded. Choose what it is, if you want it."}>
                    {field && <CircleCheck className="pointer-events-none absolute left-1.5 size-3 text-success" aria-hidden />}
                    <select
                      aria-label={`What the column "${name}" is`}
                      value={field ?? NOT_IMPORTED}
                      onChange={(e) => onColumn(column, e.target.value === NOT_IMPORTED ? null : (e.target.value as ImportField))}
                      className={cn(
                        "max-w-full cursor-pointer appearance-none truncate rounded-md py-0.5 pr-5 text-[11px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40",
                        field ? "bg-success-soft pl-5 text-success hover:bg-success-soft/70" : "bg-surface pl-1.5 text-foreground-muted ring-1 ring-inset ring-border hover:text-foreground"
                      )}
                    >
                      {FIELD_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className={cn("pointer-events-none absolute right-1 size-3", field ? "text-success" : "text-foreground-muted")} aria-hidden />
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, index) => {
            const bad = new Map<ImportField, string[]>();
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
                <td className={cn("max-w-64 border-b border-r border-border px-3 py-2 align-top", r.problems.length > 0 && "bg-danger-soft/40")}>
                  {r.blank ? (
                    <span className="text-xs italic text-foreground-muted">Empty: type a student in this row</span>
                  ) : ok ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-success">
                      <CircleCheck className="size-3.5" aria-hidden />
                      Ready
                    </span>
                  ) : (
                    // Short: the detail to fix (its message on the red box, and here when pointed at).
                    <ul className="flex flex-wrap gap-1" aria-label={`Row ${r.row} needs a fix`}>
                      {r.problems.map((p, i) => (
                        <li key={i} title={p.message} className="inline-flex items-center gap-1 rounded-md bg-danger-soft px-1.5 py-0.5 text-[11px] font-semibold text-danger ring-1 ring-inset ring-danger/30">
                          <CircleAlert className="size-3 shrink-0" aria-hidden />
                          <span>
                            {p.label}
                            <span className="sr-only">: {p.message}</span>
                          </span>
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
                  const field = byColumn[column];
                  const value = r.cells[column] ?? "";
                  const messages = field ? bad.get(field) : undefined;
                  return (
                    <td key={column} className={cn("border-b border-r border-border p-0 align-top", !field && "bg-surface-muted/60", messages && "bg-danger-soft/60")}>
                      <input
                        // A new key when the value changes from outside (Replace, Add column), so the box shows it.
                        key={`${r.row}:${column}:${value}`}
                        defaultValue={value}
                        data-cell={`${index}:${column}`}
                        list={field ? listId(fieldDef(field).input) : undefined}
                        aria-label={`${title || `Column ${column + 1}`}, row ${r.row}`}
                        aria-invalid={messages ? true : undefined}
                        title={messages?.join("\n")}
                        onBlur={(e) => {
                          if (e.target.value !== value) onCell(r.row, column, e.target.value);
                        }}
                        onKeyDown={(e) => keyDown(e, value, index, column)}
                        className={cn(
                          "h-10 w-full min-w-0 bg-transparent px-2.5 text-sm text-foreground outline-none transition-colors focus:bg-surface focus:ring-2 focus:ring-inset focus:ring-primary/40",
                          !field && "text-foreground-muted",
                          // A box that needs a fix has a red border.
                          messages && "font-semibold text-danger ring-2 ring-inset ring-danger"
                        )}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
