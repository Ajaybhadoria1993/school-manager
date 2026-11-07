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
 * The teachers as an Excel file (`GET /staff/teachers/export`): the ones the list shows (its search and filters), made by the server and
 * saved by the browser under the server's name. Asked for only when `exportTeachers` is called; a failure is said in a toast.
 */
export function useTeacherExport() {
  const [send, { isLoading: exporting }] = useDownloadSheetMutation();
  const { push } = useToast();
  const exportTeachers = useCallback(
    (query: TeacherQuery) => {
      send({ url: "/staff/teachers/export", params: paramsOf(query), fallbackName: "teachers.xlsx" })
        .unwrap()
        .catch((err) => push("error", getApiError(err)?.message ?? "Could not download the teachers file."));
    },
    [send, push]
  );
  return { exportTeachers, exporting };
}
