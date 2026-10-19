import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { reportError } from "../utils/logger";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}`, code: "NOT_FOUND" });
}

function hasProp<K extends string>(value: unknown, key: K): value is Record<K, unknown> {
  return typeof value === "object" && value !== null && key in value;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.code ? { code: err.code } : {}),
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Invalid request data",
      code: "VALIDATION_ERROR",
      details: err.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }

  // Malformed JSON body.
  if (hasProp(err, "type") && err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "Request body is not valid JSON", code: "INVALID_JSON" });
  }

  // Duplicate value on a unique index.
  if (hasProp(err, "code") && err.code === 11000) {
    return res
      .status(409)
      .json({ success: false, message: "A record with the same unique value already exists", code: "DUPLICATE" });
  }

  // Mongoose could not cast a value to the schema type (e.g. a malformed id): always a bad request.
  if (hasProp(err, "name") && err.name === "CastError") {
    return res.status(400).json({ success: false, message: "Invalid request data", code: "VALIDATION_ERROR" });
  }

  reportError(err, { method: req.method, path: req.path, userId: req.user?.userId });
  // Never leak internals (query text, stack, library messages) outside development.
  const message = !env.isProduction && err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ success: false, message, code: "INTERNAL_ERROR" });
}
