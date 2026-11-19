import { Eye, FileSpreadsheet } from "lucide-react";
import type { CustomFieldDef } from "../../../constants/studentFields";
import { cn } from "../../../utils/helpers";
import { columnLetters, infoOf } from "../../../utils/exportLayout";
import type { ExportColumn, ExportPreview } from "../../../types";
import { Card } from "../../ui/Card";
import { Skeleton } from "../../ui/Skeleton";

export interface PreviewWords {
  one: string;
  many: string;
  sampleNote: string;
}

const STUDENT_PREVIEW_WORDS: PreviewWords = {
  one: "student",
  many: "students",
  sampleNote: "No student is admitted yet, so the file has this one sample row. It is only for trying the file: it is not saved anywhere.",
};

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
  words = STUDENT_PREVIEW_WORDS,
  headingOf,
}: {
  layout: ExportColumn[];
  /** The school's own fields (a field added and not saved yet has no answers in the preview: its column is empty). */
  custom: CustomFieldDef[];
  preview: ExportPreview | undefined;
  loading: boolean;
  uploadNote: string | null;
  /** What the rows are called, for the sentences (the students' by default; the teachers' pass theirs). */
  words?: PreviewWords;
  /** A column's usual heading, for one whose heading was emptied (the students' list by default). */
  headingOf?: (key: string) => string;
}) {
  const usualHeading = headingOf ?? ((key: string) => infoOf(key, custom).heading);
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-section-heading flex items-center gap-2">
          <Eye className="size-4.5 text-primary" aria-hidden />
          Preview
        </h2>
        {preview && (
          <p className="text-xs text-foreground-muted">
            {preview.sample
              ? `Sample row · ${layout.length} column${layout.length === 1 ? "" : "s"}`
              : preview.total === 0
              ? `No ${words.one} to export · ${layout.length} column${layout.length === 1 ? "" : "s"}`
              : `The first ${Math.min(preview.rows.length, preview.total)} of ${preview.total} ${preview.total === 1 ? words.one : words.many} · ${layout.length} column${layout.length === 1 ? "" : "s"}, exactly as the file will have them`}
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
                    {c.heading.trim() || <span className="italic text-danger">{usualHeading(c.key)}?</span>}
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
      {preview?.sample && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-primary-soft px-4 py-3 text-sm text-primary-deep">
          <FileSpreadsheet className="size-4 shrink-0" aria-hidden />
          {words.sampleNote}
        </p>
      )}
      {preview && preview.rows.length === 0 && (
        <p className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-dashed border-border py-6 text-sm text-foreground-muted">
          <FileSpreadsheet className="size-4" aria-hidden />
          No {words.one} matches, so the file would only have the headings.
        </p>
      )}
      {uploadNote && <p className="mt-2 text-xs text-foreground-muted">{uploadNote}</p>}
    </Card>
  );
}
