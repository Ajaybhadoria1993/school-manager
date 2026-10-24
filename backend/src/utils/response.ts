import { Response } from "express";

/** Every success response uses this envelope: { success: true, data, message? }. */
export function sendOk<T>(res: Response, data: T, message?: string) {
  return res.status(200).json({ success: true, data, ...(message ? { message } : {}) });
}

/**
 * A file to download (a spreadsheet the server made): its bytes, the type, and the name the browser saves it under. The name is
 * readable by a page on another origin too (Access-Control-Expose-Headers), so the app can name the saved file.
 */
export function sendFile(res: Response, file: { buffer: Buffer; fileName: string; contentType?: string }) {
  const contentType = file.contentType ?? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const safeName = file.fileName.replace(/[^\w.-]+/g, "-");
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(file.buffer);
}

export function sendCreated<T>(res: Response, data: T, message?: string) {
  return res.status(201).json({ success: true, data, ...(message ? { message } : {}) });
}
