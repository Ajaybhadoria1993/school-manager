import { useEffect, useRef } from "react";
import { CircleAlert, CircleCheck, Info, Plus, Trash2, UserCheck } from "lucide-react";
import { STATES } from "../../../constants/schoolOptions";
import { BLOOD_GROUPS, CATEGORIES, GENDERS } from "../../../constants/students";
import { DISABILITIES, RELIGIONS, type CustomFieldDef } from "../../../constants/studentFields";
import { cn } from "../../../utils/helpers";
import { IMPORT_FIELDS, fieldDef, maskDayInput, type CellInput, type ImportField, type RowProblem } from "../../../utils/studentImport";
import type { AcademicStructure } from "../../../types";
import { SearchSelect } from "../../ui/SearchSelect";

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
  /** The student of this row is already in the school: said in Status in place of Ready (the row is not uploaded). */
  already?: { label: string; detail: string };
}

/** A column's detail as the table shows it: its name, the list it suggests, what an empty box says. */
function columnInfo(key: string | null, custom: readonly CustomFieldDef[]): { label: string; list?: string; placeholder?: string; date?: boolean } | null {
  if (!key) return null;
  const own = custom.find((f) => f.key === key);
  if (own) {
    return {
      label: own.label,
      list: own.type === "choice" ? listId(own.key) : own.type === "yesNo" ? listId("yesNo") : undefined,
      placeholder: own.type === "date" ? "DD-MM-YYYY" : own.type === "yesNo" ? "Yes or No" : undefined,
      date: own.type === "date",
    };
  }
  const def = fieldDef(key as ImportField);
  const input: CellInput = def.input;
  return { label: def.label, list: input === "text" || input === "date" ? undefined : listId(input), placeholder: input === "date" ? "DD-MM-YYYY" : undefined, date: input === "date" };
}

/** Puts the dashes of a day in while it is typed, keeping the caret after the same digit. */
function maskTypedDay(e: React.ChangeEvent<HTMLInputElement>) {
  const el = e.target;
  const masked = maskDayInput(el.value);
  if (masked === el.value) return;
  const digitsBefore = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/\D/g, "").length;
  el.value = masked;
  let at = 0;
  for (let seen = 0; at < masked.length && seen < digitsBefore; at++) if (/\d/.test(masked[at])) seen++;
  el.setSelectionRange(at, at);
}

/**
 * The uploaded file as a table to correct before it is uploaded, like a spreadsheet, with everything done in the table itself:
 *  - each column heading shows the file's own title and, under it, what the column was read as (green: uploaded; grey: not uploaded),
 *    a list to change it only when it was read wrong: it can be searched by typing, and ends in a row that makes a new field of the
 *    school's own when the detail is not in it. The "+" at the end adds a column (a detail the file lacks, or a field of the school's own);
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
  onNewField,
  newFieldProblem,
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
  /** A heading's list has no such detail: the page makes a new field of the school's own named `name` for column `column`. Without it the lists only choose. */
  onNewField?: (column: number, name: string) => void;
  /** Why a name cannot be a new field (a field of that name exists), or null: the list says it instead of offering the name. */
  newFieldProblem?: (name: string) => string | null;
}) {
  const options = [
    { value: NOT_IMPORTED, label: "Not uploaded" },
    ...IMPORT_FIELDS.map((f) => ({ value: f.key as string, label: f.label })),
    ...custom.map((f) => ({ value: f.key, label: `${f.label} (your own)` })),
  ];

  const wrap = useRef<HTMLDivElement>(null);
  // The box (row:column) to give the focus back to once the table has drawn the change it just kept (a kept box is drawn again).
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    const at = refocus.current;
    if (!at) return;
    refocus.current = null;
    const box = wrap.current?.querySelector<HTMLInputElement>(`[data-at="${at}"]`);
    if (!box || box === document.activeElement) return;
    box.focus({ preventScroll: true });
    box.setSelectionRange(box.value.length, box.value.length);
  });

  /**
   * A list box (class, section, gender, state...) is kept as soon as it holds one of its choices: picked from the list, or typed in
   * full ("class 6" becomes "Class 6"), so its red message goes at once. While the words could still go on into another choice
   * ("Class 1" on the way to "Class 10") it waits, and a word that is none of the choices is kept when the person leaves the box.
   */
  function keepChoice(e: React.ChangeEvent<HTMLInputElement>, list: string, row: number, column: number, was: string, hadProblem: boolean) {
    const typed = e.target.value.trim().toLowerCase();
    if (!typed || typed === was.trim().toLowerCase()) return;
    const choices = [...(document.getElementById(list)?.querySelectorAll("option") ?? [])].map((o) => o.value);
    const choice = choices.find((c) => c.toLowerCase() === typed);
    if (!choice) return;
    // A choice taken from the browser's list arrives as one change; typing arrives a letter at a time.
    const native = e.nativeEvent as InputEvent;
    const picked = !(native instanceof InputEvent) || native.inputType === "insertReplacementText";
    if (!picked && choices.some((c) => c !== choice && c.toLowerCase().startsWith(typed))) return;
    refocus.current = `${row}:${column}`;
    // Leaving the box later must not keep it a second time.
    e.target.dataset.kept = e.target.value;
    onCell(row, column, choice, hadProblem);
  }

  /**
   * Focuses a box and scrolls only the table (not the page) just enough to show it: below the headings, right of the row column.
   * `focus()` alone would scroll the whole page to the box.
   */
  function focusBox(box: HTMLInputElement | null | undefined) {
    if (!box) return;
    box.focus({ preventScroll: true });
    const view = wrap.current;
    if (!view) return;
    const area = view.getBoundingClientRect();
    const at = box.getBoundingClientRect();
    const top = area.top + (view.querySelector("thead")?.getBoundingClientRect().height ?? 0);
    const left = area.left + (view.querySelector("tbody td")?.getBoundingClientRect().width ?? 0);
    if (at.top < top) view.scrollTop -= top - at.top;
    else if (at.bottom > area.bottom) view.scrollTop += at.bottom - area.bottom;
    if (at.left < left) view.scrollLeft -= left - at.left;
    else if (at.right > area.right) view.scrollLeft += at.right - area.right;
  }

  /** Enter: keep the change and go to the same column of the next row. */
  function keyDown(e: React.KeyboardEvent<HTMLInputElement>, original: string, index: number, column: number) {
    if (e.key === "Escape") {
      e.currentTarget.value = original;
      e.currentTarget.blur();
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
      focusBox(document.querySelector<HTMLInputElement>(`[data-cell="${index + 1}:${column}"]`));
    }
  }

  /** A detail to fix: its box in this row gets the focus (scrolled into view), or its column is added. */
  function goTo(index: number, row: number, fields: string[]) {
    const column = fields.map((f) => byColumn.indexOf(f)).find((c) => c >= 0);
    if (column === undefined) {
      if (fields[0]) onMissing(fields[0], row);
      return;
    }
    focusBox(document.querySelector<HTMLInputElement>(`[data-cell="${index}:${column}"]`));
  }

  return (
    // overscroll-contain: at the end of the table the wheel (or a swipe) does not carry on to the page behind it.
    <div ref={wrap} className="relative max-h-[calc(100vh-14rem)] min-h-64 overflow-auto overscroll-contain rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
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
                    <SearchSelect
                      aria-label={`What the column "${name}" is`}
                      value={key ?? NOT_IMPORTED}
                      options={options}
                      onChange={(next) => onColumn(column, next === NOT_IMPORTED || !next ? null : next)}
                      // Searched by typing; a detail that is not in the list is made here, named as typed (or as the file calls the column).
                      create={
                        onNewField
                          ? {
                              idle: "Add a new field…",
                              typed: (word) => `Add “${word}” as a new field`,
                              refuse: newFieldProblem,
                              // With nothing typed, the file's own title is the name offered, unless that name is taken.
                              onCreate: (word) => onNewField(column, word || (title.trim() && !newFieldProblem?.(title) ? title.trim() : "")),
                            }
                          : undefined
                      }
                      inputClassName={cn(
                        // One line: a long name ends in "..." (the list shows it whole).
                        "h-7 rounded-md pl-2 pr-7 text-[11px] font-semibold",
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
            const ok = r.problems.length === 0 && !r.blank && !r.already;
            return (
              <tr key={r.row} className="group/row">
                <td className={cn("sticky left-0 z-10 border-b border-r border-border px-2 py-1.5 align-top", r.problems.length > 0 ? "bg-danger-soft" : r.already ? "bg-surface-muted" : "bg-surface")}>
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
                <td className={cn("max-w-56 border-b border-r border-border px-3 py-2 align-top", r.problems.length > 0 && "bg-danger-soft/40", r.already && "bg-surface-muted/70")}>
                  {r.blank ? (
                    <span className="text-xs italic text-foreground-muted">Empty: type a student in this row</span>
                  ) : r.already ? (
                    // The student is in the school already: not uploaded again, and nothing in this row needs a fix.
                    <div>
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary-deep">
                        <UserCheck className="size-3.5" aria-hidden />
                        {r.already.label}
                      </span>
                      <p className="mt-0.5 text-[11px] text-foreground-muted">{r.already.detail}</p>
                    </div>
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
                          onChange={info?.date ? maskTypedDay : info?.list ? (e) => keepChoice(e, info.list!, r.row, column, value, !!messages) : undefined}
                          onBlur={(e) => {
                            if (e.target.dataset.kept === e.target.value) return;
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
