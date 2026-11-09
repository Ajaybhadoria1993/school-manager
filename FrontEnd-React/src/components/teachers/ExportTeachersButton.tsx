import { Download } from "lucide-react";
import { useTeacherExport } from "../../hooks/useTeacherExport";
import type { TeacherQuery } from "../../types";
import { Button } from "../ui/Button";

/**
 * Export, in the header of the teacher pages (like the students' Export): the teachers the list shows now, with its search and filters, as an
 * Excel file. It is off while the list shows nobody (nothing to export).
 */
export function ExportTeachersButton({ query, empty }: { query: TeacherQuery; empty: boolean }) {
  const { exportTeachers, exporting } = useTeacherExport();
  return (
    <Button variant="outline" loading={exporting} disabled={empty} onClick={() => exportTeachers(query)}>
      {!exporting && <Download className="size-4" aria-hidden />}
      Export
    </Button>
  );
}
