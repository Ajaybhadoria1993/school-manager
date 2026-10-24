/** Every success response is { success: true, data, message? }. */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

/** An API failure, flattened from whatever the request layer produced. */
export interface ApiError {
  /** The HTTP status, or 0 when the server could not be reached. */
  status: number;
  message: string;
  /** Stable machine-readable id from the API (e.g. "RESET_INVALID"); branch on this, not on `message`. */
  code?: string;
  /** For a validation error: [{ path, message }]. */
  details?: unknown;
}
