import { useCallback } from "react";
import { useDownloadSheetMutation } from "../redux/api/studentsApi";
import type { ProgressFilter } from "../types";
import { getApiError } from "../utils/apiErrors";
import { useToast } from "../components/ui/toast-context";

/**
 * Teaching progress as an Excel file (`GET /classroom/progress/export`): the days and filters the page shows, made by the server and saved by
 * the browser under the server's name. A failure is said in a toast.
 */
export function useProgressExport() {
  const [send, { isLoading: exporting }] = useDownloadSheetMutation();
  const { push } = useToast();
  const exportProgress = useCallback(
    async (filter: ProgressFilter) => {
      try {
        await send({ url: "/classroom/progress/export", params: { ...filter }, fallbackName: "teaching-progress.xlsx" }).unwrap();
      } catch (err) {
        push("error", getApiError(err)?.message ?? "Could not download the teaching progress.");
      }
    },
    [send, push]
  );
  return { exportProgress, exporting };
}
