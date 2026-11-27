import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ApiError } from "../utils/ApiError";

export const MAX_RESUME_BYTES = 2 * 1024 * 1024;

const document = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_RESUME_BYTES, files: 1, fields: 0 } });

/** One file in the "resume" field, kept in memory only while it is checked and stored. */
export function resumeFile(req: Request, res: Response, next: NextFunction) {
  document.single("resume")(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const tooBig = err.code === "LIMIT_FILE_SIZE";
      const message = tooBig ? `The resume is bigger than ${MAX_RESUME_BYTES / (1024 * 1024)} MB. Choose a smaller file.` : "Choose one file for the resume.";
      return next(ApiError.badRequest(message, tooBig ? "RESUME_TOO_BIG" : "RESUME_MISSING", [{ path: "resume", message }]));
    }
    next(err);
  });
}
