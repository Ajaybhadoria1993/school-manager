import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ApiError } from "../utils/ApiError";

/** A student's photo for the ID card: small (the app shrinks it before sending), so a big file is a mistake. */
export const MAX_PHOTO_BYTES = 300 * 1024;

const picture = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 0 } });

/** One picture in the "photo" field, kept in memory only while it is checked and stored. */
export function photoFile(req: Request, res: Response, next: NextFunction) {
  picture.single("photo")(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const tooBig = err.code === "LIMIT_FILE_SIZE";
      const message = tooBig ? `The photo is bigger than ${MAX_PHOTO_BYTES / 1024} KB. Choose a smaller picture.` : "Choose one picture for the photo.";
      return next(ApiError.badRequest(message, tooBig ? "PHOTO_TOO_BIG" : "PHOTO_MISSING", [{ path: "photo", message }]));
    }
    next(err);
  });
}
