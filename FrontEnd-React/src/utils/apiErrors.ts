import type { ApiError } from "../types";

export const NETWORK_MESSAGE = "Can't reach the server. Check your connection and try again.";
const GENERIC_MESSAGE = "Something went wrong";

/**
 * Flattens whatever a request threw (RTK Query's `.unwrap()` rejects with the error the base query returned)
 * into { status, message, code, details }. Returns null for anything that did not come from a request, so a
 * caller can fall back to its own sentence for programming errors:
 *
 *   setError(getApiError(err)?.message ?? "Something went wrong. Please try again.");
 */
export function getApiError(err: unknown): ApiError | null {
  if (!err || typeof err !== "object" || !("status" in err)) return null;
  const { status, data } = err as { status: unknown; data?: unknown };

  // The server could not be reached (offline, down, blocked).
  if (status === "FETCH_ERROR" || status === "TIMEOUT_ERROR") {
    return { status: 0, message: NETWORK_MESSAGE, code: "NETWORK_ERROR" };
  }
  if (typeof status !== "number") {
    return { status: 0, message: GENERIC_MESSAGE };
  }

  const body = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return {
    status,
    message: typeof body.message === "string" && body.message ? body.message : GENERIC_MESSAGE,
    code: typeof body.code === "string" ? body.code : undefined,
    details: body.details,
  };
}
