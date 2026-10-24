import { useState } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Info, Loader2 } from "lucide-react";
import { IMPORT_ROWS_PER_PAGE } from "../../../constants/students";
import { cn } from "../../../utils/helpers";
import type { RowProblem } from "../../../utils/studentImport";
import { Button } from "../../ui/Button";

/** One row of the file as the check and the result show it. */
export interface ViewRow {
  row: number;
  name: string;
  /** The school's own number from the file, or the one the student was given. */
  admissionNumber: string | null;
  classLabel: string;
  parentLabel: string;
  status: "checking" | "ready" | "problem" | "admitted" | "failed";
  problems: RowProblem[];
  warnings: string[];
  /** Admitted: the student's page. */
  studentId?: string;
}

type Filter = "all" | "good" | "bad";

const TH = "px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-foreground-muted";
const isGood = (r: ViewRow) => r.status === "ready" || r.status === "admitted";
const isBad = (r: ViewRow) => r.status === "problem" || r.status === "failed";

function Status({ row }: { row: ViewRow }) {
  if (row.status === "checking") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground-muted">
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Checking
      </span>
    );
  }
  return (
    <div className="space-y-1.5">
      {isGood(row) ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-bold text-success ring-1 ring-inset ring-success-line">
          <CircleCheck className="size-3.5" aria-hidden />
          {row.status === "admitted" ? "Admitted" : "Ready"}
        </span>
      ) : (
        <ul className="space-y-1">
          {row.problems.map((p, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-danger">
              <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
              <span>
                <span className="font-bold">{p.label}:</span> {p.message}
              </span>
            </li>
          ))}
        </ul>
      )}
      {row.warnings.map((w, i) => (
        <p key={i} className="flex items-start gap-1.5 text-xs text-warning">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          {w}
        </p>
      ))}
    </div>
  );
}

/**
 * The rows of the file with what will happen (or happened) to each: ready / admitted, or every problem named by its column ("Father's
 * mobile: Enter a valid 10-digit mobile number"). Three tabs (all, the good ones, the ones to fix) and pages of 50. On a phone the class
 * and the parent go under the name, so the table never scrolls sideways.
 */
export function ImportRowsTable({ rows, goodLabel, badLabel }: { rows: ViewRow[]; goodLabel: string; badLabel: string }) {
  const [filter, setFilter] = useState<Filter>(rows.some(isBad) ? "bad" : "all");
  const [page, setPage] = useState(1);
  const counts = { all: rows.length, good: rows.filter(isGood).length, bad: rows.filter(isBad).length };
  const shown = rows.filter((r) => (filter === "all" ? true : filter === "good" ? isGood(r) : isBad(r)));
  const pages = Math.max(1, Math.ceil(shown.length / IMPORT_ROWS_PER_PAGE));
  const current = Math.min(page, pages);
  const slice = shown.slice((current - 1) * IMPORT_ROWS_PER_PAGE, current * IMPORT_ROWS_PER_PAGE);
  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: "All rows" },
    { key: "good", label: goodLabel },
    { key: "bad", label: badLabel },
  ];

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
      <div role="tablist" aria-label="Which rows to show" className="flex flex-wrap gap-1.5 border-b border-border bg-background px-3 py-2.5">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={filter === tab.key}
            onClick={() => {
              setFilter(tab.key);
              setPage(1);
            }}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors",
              filter === tab.key ? "bg-surface text-foreground shadow-sm ring-1 ring-border" : "text-foreground-muted hover:text-foreground"
            )}
          >
            {tab.label}
            <span
              className={cn(
                "rounded-full px-1.5 text-xs",
                tab.key === "bad" && counts.bad > 0 ? "bg-danger-soft text-danger" : tab.key === "good" ? "bg-success-soft text-success" : "bg-surface-muted text-foreground-muted"
              )}
            >
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {slice.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-foreground-muted">No rows here.</p>
      ) : (
        <table className="w-full border-collapse text-sm" aria-label="Rows of the file">
          <thead className="border-b border-border">
            <tr>
              <th scope="col" className={cn(TH, "w-16")}>
                Row
              </th>
              <th scope="col" className={TH}>
                Student
              </th>
              <th scope="col" className={cn(TH, "hidden md:table-cell")}>
                Class
              </th>
              <th scope="col" className={cn(TH, "hidden lg:table-cell")}>
                Parent
              </th>
              <th scope="col" className={cn(TH, "hidden sm:table-cell")}>
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {slice.map((r) => (
              <tr key={r.row} className={cn("align-top", isBad(r) && "bg-danger-soft/30")}>
                <td className="px-4 py-3 font-mono text-xs text-foreground-muted">{r.row}</td>
                <td className="px-4 py-3">
                  {r.studentId ? (
                    <Link to={`/school/students/${r.studentId}`} className="font-semibold text-primary-deep underline-offset-2 hover:underline">
                      {r.name}
                    </Link>
                  ) : (
                    <span className="font-semibold text-foreground">{r.name}</span>
                  )}
                  {r.admissionNumber && <span className="block text-xs text-foreground-muted">{r.admissionNumber}</span>}
                  <span className="mt-0.5 block text-xs text-foreground-muted md:hidden">{r.classLabel}</span>
                  <span className="block text-xs text-foreground-muted lg:hidden">{r.parentLabel}</span>
                  <div className="mt-2 sm:hidden">
                    <Status row={r} />
                  </div>
                </td>
                <td className="hidden px-4 py-3 text-foreground md:table-cell">{r.classLabel}</td>
                <td className="hidden px-4 py-3 text-foreground-muted lg:table-cell">{r.parentLabel}</td>
                <td className="hidden max-w-md px-4 py-3 sm:table-cell">
                  <Status row={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pages > 1 && (
        <nav aria-label="Pages of rows" className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-sm text-foreground-muted">
          <span>
            {(current - 1) * IMPORT_ROWS_PER_PAGE + 1} to {Math.min(shown.length, current * IMPORT_ROWS_PER_PAGE)} of {shown.length}
          </span>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="px-2" aria-label="Previous rows" disabled={current <= 1} onClick={() => setPage(current - 1)}>
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <span className="px-1 font-semibold text-foreground">
              {current} / {pages}
            </span>
            <Button variant="outline" size="sm" className="px-2" aria-label="Next rows" disabled={current >= pages} onClick={() => setPage(current + 1)}>
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
