import { useState } from "react";
import { getApiError } from "../../utils/apiErrors";
import type { ApiError } from "../../types";

/**
 * The "Save" of a dialog or a form: runs the request, keeps it busy meanwhile, calls `onDone` (a dialog closes) when the
 * request worked and keeps what the server said when it did not (`error.code` lets a form point at the field that is wrong).
 * A form that stays on the page simply goes back to not being busy.
 */
export function useSave(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onDone();
      setBusy(false);
    } catch (err) {
      setError(getApiError(err) ?? { status: 0, message: "Something went wrong. Please try again." });
      setBusy(false);
    }
  }

  return { busy, error, run, clearError: () => setError(null) };
}
