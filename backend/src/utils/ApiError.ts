export class ApiError extends Error {
  statusCode: number;
  details?: unknown;
  /** Stable machine-readable identifier the frontend can branch on (e.g. "INVITE_EXPIRED"). */
  code?: string;

  constructor(statusCode: number, message: string, details?: unknown, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, code?: string, details?: unknown) {
    return new ApiError(400, message, details, code);
  }
  static unauthorized(message = "Unauthorized", code?: string) {
    return new ApiError(401, message, undefined, code);
  }
  static forbidden(message = "Forbidden", code?: string, details?: unknown) {
    return new ApiError(403, message, details, code);
  }
  static notFound(message = "Not found", code?: string) {
    return new ApiError(404, message, undefined, code);
  }
  static conflict(message: string, code?: string, details?: unknown) {
    return new ApiError(409, message, details, code);
  }
}
