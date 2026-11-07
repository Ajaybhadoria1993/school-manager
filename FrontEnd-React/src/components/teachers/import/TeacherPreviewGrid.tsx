import { useRef } from "react";
import { CircleAlert, CircleCheck, Info, Trash2, UserCheck } from "lucide-react";
import { STATES } from "../../../constants/schoolOptions";
import { DESIGNATIONS } from "../../../constants/teachers";
import type { CustomFieldDef } from "../../../constants/studentFields";
import { cn } from "../../../utils/helpers";
import { TEACHER_IMPORT_FIELDS, maskDayInput, teacherFieldDef, type TeacherImportField, type TeacherRowProblem } from "../../../utils/teacherImport";
import { Select } from "../../ui/Select";

const NOT_IMPORTED = "none";
/** The last row of a heading's list: a column of the file that is no detail yet becomes a field of the school's own. */
const NEW_FIELD = "__new_field__";

/** The suggestions a box offers while typing (a list column: gender, state, kind of job, designation). */
const LISTS: Record<string, readonly string[]> = {
  gender: ["Male", "Female", "Other"],
  state: STATES,
  employment: ["Full time", "Part time", "Contract"],
  designation: DESIGNATIONS,
};
const listId = (input: string) => `teacher-import-${input}`;

/** What a column's boxes suggest while typing, and whether they hold a day: by the detail, or by the kind of the school's own field. */
function infoOf(key: string | null, own: readonly CustomFieldDef[]): { list?: string; date?: boolean } {
  if (!key) return {};
  const mine = own.find((f) => f.key === key);
  if (mine) return mine.type === "choice" ? { list: listId(`own-${key}`) } : mine.type === "yesNo" ? { list: listId("yesno") } : { date: mine.type === "date" };
  const input = teacherFieldDef(key as TeacherImportField).input;
  return { list: LISTS[input] ? listId(input) : undefined, date: input === "date" };
}

export interface TeacherGridRow {
  row: number;
  cells: string[];
  problems: TeacherRowProblem[];
  warnings: string[];
  /** The teacher of this row is already in the school: said in Status in place of Ready (the row is not uploaded). */
  already?: { label: string; detail: string };
}

/**
 * The uploaded file as a table to correct before it is uploaded, like a spreadsheet:
 *  - each column heading shows the file's own title and, under it, what the column was read as (green: uploaded; grey: not uploaded),
 *    a list to change it only when it was read wrong;
 *  - every cell can be changed (Enter keeps the change and goes down, Escape puts it back); a list column suggests its values (gender,
 *    state, kind of job, designation) and a day is shaped as DD-MM-YYYY while it is typed;
 *  - a box that needs a fix has a red border and says under it what is wrong; the row's Status lists the details to fix, each a button
 *    that takes the person to its box. The bin leaves a row out of the upload.
 * The row number and the bin stay at the left while the table scrolls sideways; the headings stay on top while it scrolls down.
 */
export function TeacherPreviewGrid({
  headers,
  rows,
  byColumn,
  onCell,
  onRemove,
  onColumn,
  onMissing,
  own = [],
  onNewField,
}: {
  headers: string[];
  rows: TeacherGridRow[];
  /** What each column was read as: a detail, the `c_` key of one of the school's own fields, or null (not uploaded). */
  byColumn: (string | null)[];
  onCell: (row: number, column: number, value: string) => void;
  onRemove: (row: number) => void;
  onColumn: (column: number, field: string | null) => void;
  /** A detail to fix that has no column yet (the server refused a username and the file has none): the page adds the column and takes the person to the box. */
  onMissing: (field: string, row: number) => void;
  /** The school's own fields the table offers (the ones it asks). */
  own?: readonly CustomFieldDef[];
  /** A heading's list has no such detail: the page makes a field of the school's own for column `column`, named `title` (the file's title) at first. */
  onNewField?: (column: number, title: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const options = [
    { value: NOT_IMPORTED, label: "Not uploaded" },
    ...TEACHER_IMPORT_FIELDS.map((f) => ({ value: f.key as string, label: f.label })),
    ...own.map((f) => ({ value: f.key, label: `${f.label} (your own)` })),
    ...(onNewField ? [{ value: NEW_FIELD, label: "Add a new field…" }] : []),
  ];

  /** Focuses a box and scrolls only the table (not the page) just enough to show it: below the headings, right of the row column. */
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

  /** Enter: keep the change and go to the same column of the next row. Escape: put the box back. */
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
    if (column === undefined) onMissing(fields[0], row);
    else focusBox(document.querySelector<HTMLInputElement>(`[data-cell="${index}:${column}"]`));
  }

  /** A day typed in a box is shaped as DD-MM-YYYY, the caret staying after the same digit. */
  function maskTyped(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    const masked = maskDayInput(el.value);
    if (masked === el.value) return;
    const digitsBefore = el.value.slice(0, el.selectionStart ?? el.value.length).replace(/\D/g, "").length;
    el.value = masked;
    let at = 0;
    for (let seen = 0; at < masked.length && seen < digitsBefore; at++) if (/\d/.test(masked[at])) seen++;
    el.setSelectionRange(at, at);
  }

  return (
    // overscroll-contain: at the end of the table the wheel (or a swipe) does not carry on to the page behind it.
    <div ref={wrap} className="relative max-h-[calc(100vh-14rem)] min-h-64 overflow-auto overscroll-contain rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
      {Object.entries(LISTS).map(([input, values]) => (
        <datalist key={input} id={listId(input)}>
          {values.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      ))}
      {own.filter((f) => f.type === "choice").map((f) => (
        <datalist key={f.key} id={listId(`own-${f.key}`)}>
          {f.options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      ))}
      <datalist id={listId("yesno")}>
        <option value="Yes" />
        <option value="No" />
      </datalist>
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
                      onChange={(next) => (next === NEW_FIELD ? onNewField?.(column, title) : onColumn(column, next === NOT_IMPORTED || !next ? null : next))}
                      triggerClassName={cn("h-7 rounded-md pl-2 pr-7 text-[11px] font-semibold", key ? "border-transparent bg-success-soft text-success" : "text-foreground-muted")}
                    />
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, index) => {
            const bad = new Map<string, string[]>();
            for (const p of r.problems) for (const f of p.fields) bad.set(f, [...(bad.get(f) ?? []), p.message]);
            const ok = r.problems.length === 0 && !r.already;
            return (
              <tr key={r.row}>
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
                  {r.already ? (
                    // The teacher is in the school already: not uploaded again, and nothing in this row needs a fix.
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
                  const info = infoOf(key, own);
                  const value = r.cells[column] ?? "";
                  const messages = key ? bad.get(key) : undefined;
                  return (
                    <td key={column} className={cn("border-b border-r border-border p-0 align-top", !key && "bg-surface-muted/60")}>
                      {/* A box that needs a fix: a red border, and what is wrong under it. */}
                      <div className={cn(messages && "m-0.5 rounded-md bg-danger-soft/50 ring-2 ring-inset ring-danger")}>
                        <input
                          // A new key when the value changes from outside, so the box shows it.
                          key={`${r.row}:${column}:${value}`}
                          defaultValue={value}
                          data-cell={`${index}:${column}`}
                          list={info.list}
                          placeholder={info.date ? "DD-MM-YYYY" : undefined}
                          aria-label={`${title || `Column ${column + 1}`}, row ${r.row}`}
                          aria-invalid={messages ? true : undefined}
                          title={messages?.join("\n")}
                          onChange={info.date ? maskTyped : undefined}
                          onBlur={(e) => {
                            if (e.target.value !== value) onCell(r.row, column, e.target.value);
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
