import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/ApiError";
import { reportError } from "../utils/logger";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      details: err.details,
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Invalid request data",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }

  if (err && typeof err === "object" && "code" in err && (err as { code: number }).code === 11000) {
    return res.status(409).json({
      success: false,
      message: "A record with the same unique value already exists",
    });
  }

  // Mongoose couldn't cast a query/body value to the schema's type — always
  // a malformed request (e.g. a non-ObjectId id, or an injection attempt
  // neutralized into a shape the field never expected), never a server bug.
  if (err && typeof err === "object" && "name" in err && (err as { name: string }).name === "CastError") {
    return res.status(400).json({ success: false, message: "Invalid request data" });
  }

  reportError(err, { method: req.method, path: req.path, userId: req.user?.userId });
  const message = err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ success: false, message });
}
