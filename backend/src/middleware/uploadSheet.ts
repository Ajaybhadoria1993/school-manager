import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ApiError } from "../utils/ApiError";
import { MAX_IMPORT_FILE_BYTES } from "../main/students/constants";

/**
 * One spreadsheet in the "file" field, kept in memory only while it is read (it is never stored), up to 5 MB. A file that is too big or
 * sent another way is refused with a message for the person, like any other wrong field. Used by every bulk upload (students, teachers).
 */
const spreadsheet = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1, fields: 5 } });

export function importFile(req: Request, res: Response, next: NextFunction) {
  spreadsheet.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? `The file is bigger than ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB. Split it into smaller files.`
          : "Upload one spreadsheet file.";
      return next(ApiError.badRequest(message, err.code === "LIMIT_FILE_SIZE" ? "IMPORT_FILE_TOO_BIG" : "IMPORT_FILE_MISSING", [{ path: "file", message }]));
    }
    next(err);
  });
}
