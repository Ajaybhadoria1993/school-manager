import { Link } from "react-router";
import { Download } from "lucide-react";
import type { TeacherQuery } from "../../types";

const OUTLINE =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-150 hover:border-[#cbd5e1] hover:bg-background focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20";

/**
 * Export, in the header of the teacher pages (like the students' Export): it opens the Export page (`${base}/export`) with the list's own search
 * and filters, where the Excel's columns are seen and changed and the file is made. It is never off: a school with no teacher yet opens it to see
 * the file with its one sample row.
 */
export function ExportTeachersButton({ query, base }: { query: TeacherQuery; base: string }) {
  const search = new URLSearchParams({
    status: query.status ?? "active",
    ...(query.search ? { q: query.search } : {}),
    ...(query.subjectId ? { subject: query.subjectId } : {}),
    ...(query.classId ? { class: query.classId } : {}),
    ...(query.designation ? { designation: query.designation } : {}),
  }).toString();
  return (
    <Link to={{ pathname: `${base}/export`, search }} className={OUTLINE}>
      <Download className="size-4" aria-hidden />
      Export
    </Link>
  );
}
