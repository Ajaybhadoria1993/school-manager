import { useCallback } from "react";
import { useDownloadSheetMutation } from "../redux/api/studentsApi";
import { getApiError } from "../utils/apiErrors";
import { useToast } from "../components/ui/toast-context";

/**
 * The school's sample Excel for the bulk upload (`GET /students/import/template`): made by the server with this school's classes and
 * needs, and saved by the browser under the server's name. Asked for only when `download` is called; a failure is said in a toast.
 * Used by every screen that offers the sample (the students' bulk upload's first step, and `kind: "teachers"` for the teachers': `GET /staff/teachers/import/template`).
 */
export function useSampleDownload(kind: "students" | "teachers" = "students") {
  const [send, { isLoading: downloading }] = useDownloadSheetMutation();
  const { push } = useToast();
  const download = useCallback(() => {
    send(kind === "teachers" ? { url: "/staff/teachers/import/template", fallbackName: "teachers-template.xlsx" } : { url: "/students/import/template", fallbackName: "students-template.xlsx" })
      .unwrap()
      .catch((err) => push("error", getApiError(err)?.message ?? "Could not download the sample file."));
  }, [send, push, kind]);
  return { download, downloading };
}
