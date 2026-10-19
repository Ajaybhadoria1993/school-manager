import { Response } from "express";

/** Every success response uses this envelope: { success: true, data, message? }. */
export function sendOk<T>(res: Response, data: T, message?: string) {
  return res.status(200).json({ success: true, data, ...(message ? { message } : {}) });
}

export function sendCreated<T>(res: Response, data: T, message?: string) {
  return res.status(201).json({ success: true, data, ...(message ? { message } : {}) });
}
