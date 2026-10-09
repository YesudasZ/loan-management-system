import type { Response } from 'express';

/** Sends the standard success envelope: `{ success: true, data }`. */
export function sendSuccess(res: Response, statusCode: number, data: unknown): void {
  res.status(statusCode).json({ success: true, data });
}
