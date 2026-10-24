import { Eye, FileSpreadsheet } from "lucide-react";
import type { CustomFieldDef } from "../../../constants/studentFields";
import { cn } from "../../../utils/helpers";
import { columnLetters, infoOf } from "../../../utils/exportLayout";
import type { ExportColumn, ExportPreview } from "../../../types";
import { Card } from "../../ui/Card";
import { Skeleton } from "../../ui/Skeleton";

/**
 * The file before it is made, under the fields: the sheet's letters, the headings of the fields that are on (in their order), and the
 * first students' rows (the headings even when no student matches). The rows were read once with the page (every column's value comes
 * in the same answer), so a change to the fields shows here at once and asks for nothing. `uploadNote` says what a file of this layout
 * lacks to come back through Bulk upload.
 */
export function ExportPreviewCard({
  layout,
  custom,
  preview,
  loading,
  uploadNote,
}: {
  layout: ExportColumn[];
  /** The school's own fields (a field added and not saved yet has no answers in the preview: its column is empty). */
  custom: CustomFieldDef[];
  preview: ExportPreview | undefined;
  loading: boolean;
  uploadNote: string | null;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <Eye className="size-4.5 text-primary" aria-hidden />
          Preview
        </h2>
        {preview && (
          <p className="text-xs text-foreground-muted">
            {preview.total === 0
              ? `No student to export · ${layout.length} column${layout.length === 1 ? "" : "s"}`
              : `The first ${Math.min(preview.rows.length, preview.total)} of ${preview.total} student${preview.total === 1 ? "" : "s"} · ${layout.length} column${layout.length === 1 ? "" : "s"}, exactly as the file will have them`}
          </p>
        )}
      </div>

      {!preview && loading ? (
        <Skeleton className="mt-3 h-56 rounded-xl" />
      ) : !preview ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
          <FileSpreadsheet className="size-6 text-foreground-muted" aria-hidden />
          <p className="text-sm text-foreground-muted">The students could not be read. Open the page again.</p>
        </div>
      ) : (
        <div className={cn("mt-3 overflow-x-auto rounded-xl border border-border", loading && "opacity-70 transition-opacity")}>
          <table className="w-max min-w-full border-collapse text-sm">
            <caption className="sr-only">The export as it will look</caption>
            <thead>
              <tr className="bg-surface-muted">
                <th scope="col" className="w-10 border-b border-r border-border px-2 py-1 text-[11px] font-semibold text-foreground-muted" aria-label="Row" />
                {layout.map((c, i) => (
                  <th key={c.key} scope="col" className="border-b border-r border-border px-3 py-1 text-center font-mono text-[11px] font-semibold text-foreground-muted last:border-r-0">
                    {columnLetters(i)}
                  </th>
                ))}
              </tr>
              <tr className="bg-primary-soft">
                <th scope="row" className="border-b border-r border-border px-2 py-2 text-center font-mono text-[11px] font-semibold text-foreground-muted">
                  1
                </th>
                {layout.map((c) => (
                  <th key={c.key} scope="col" className="max-w-56 whitespace-nowrap border-b border-r border-border px-3 py-2 text-left text-xs font-bold text-primary-deep last:border-r-0">
                    {c.heading.trim() || <span className="italic text-danger">{infoOf(c.key, custom).heading}?</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row, r) => (
                <tr key={r} className="even:bg-background/60">
                  <th scope="row" className="border-b border-r border-border px-2 py-2 text-center font-mono text-[11px] font-semibold text-foreground-muted">
                    {r + 2}
                  </th>
                  {layout.map((c) => (
                    <td key={c.key} className="max-w-56 truncate whitespace-nowrap border-b border-r border-border px-3 py-2 text-foreground last:border-r-0">
                      {row[c.key] === "" || row[c.key] == null ? <span className="text-foreground-muted/50">·</span> : String(row[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {preview && preview.rows.length === 0 && (
        <p className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-6 text-sm text-foreground-muted">
          <FileSpreadsheet className="size-4" aria-hidden />
          No student matches, so the file would only have the headings.
        </p>
      )}
      {uploadNote && <p className="mt-2 text-xs text-foreground-muted">{uploadNote}</p>}
    </Card>
  );
}
