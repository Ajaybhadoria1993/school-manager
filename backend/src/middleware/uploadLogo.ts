import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ApiError } from "../utils/ApiError";

export const MAX_LOGO_BYTES = 500 * 1024;

const picture = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_LOGO_BYTES, files: 1, fields: 0 } });

/** One picture in the "logo" field, kept in memory only while it is checked and stored. */
export function logoFile(req: Request, res: Response, next: NextFunction) {
  picture.single("logo")(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const tooBig = err.code === "LIMIT_FILE_SIZE";
      const message = tooBig ? `The logo is bigger than ${MAX_LOGO_BYTES / 1024} KB. Choose a smaller picture.` : "Choose one picture for the logo.";
      return next(ApiError.badRequest(message, tooBig ? "LOGO_TOO_BIG" : "LOGO_MISSING", [{ path: "logo", message }]));
    }
    next(err);
  });
}
