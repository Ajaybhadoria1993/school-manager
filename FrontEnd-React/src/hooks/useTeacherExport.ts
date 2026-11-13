import { useCallback } from "react";
import { useDownloadSheetMutation } from "../redux/api/studentsApi";
import type { TeacherQuery } from "../types";
import { getApiError } from "../utils/apiErrors";
import { useToast } from "../components/ui/toast-context";

/** The list's own filters as the export's address takes them (an empty filter is left out). */
function paramsOf(query: TeacherQuery): Record<string, string> {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== "")) as Record<string, string>;
}

/**
 * The teachers as an Excel file (`GET /staff/teachers/export`): the ones the list shows (its search and filters), in the school's own columns,
 * made by the server and saved by the browser under the server's name. A school with no teacher gets the headings and one sample row. Asked
 * for only when `exportTeachers` is called: it answers true once the file is saved and false after a failure, which is said in a toast.
 */
export function useTeacherExport() {
  const [send, { isLoading: exporting }] = useDownloadSheetMutation();
  const { push } = useToast();
  const exportTeachers = useCallback(
    async (query: TeacherQuery): Promise<boolean> => {
      try {
        await send({ url: "/staff/teachers/export", params: paramsOf(query), fallbackName: "teachers.xlsx" }).unwrap();
        return true;
      } catch (err) {
        push("error", getApiError(err)?.message ?? "Could not download the teachers file.");
        return false;
      }
    },
    [send, push]
  );
  return { exportTeachers, exporting };
}
