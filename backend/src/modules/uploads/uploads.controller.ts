import { pipeline } from 'node:stream/promises';
import type { Request, Response } from 'express';
import { getAuthUser } from '../../middleware/authenticate.js';
import { AppError } from '../../utils/app-error.js';
import { sendSuccess } from '../../utils/respond.js';
import type { LoanIdParams } from '../../utils/schemas.js';
import * as uploadsService from './uploads.service.js';

const EXTENSION_BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

// The slip is shown inline (an <iframe> for PDFs). This policy replaces helmet's default for
// this response: Chrome's PDF viewer needs object-src, and the file may only be framed by us.
const SALARY_SLIP_CSP = "default-src 'none'; object-src 'self'; frame-ancestors 'self'";

/** Streams a salary slip with headers that keep it private and stop content sniffing. */
export async function sendSalarySlip(
  res: Response,
  download: uploadsService.SalarySlipDownload,
): Promise<void> {
  const extension = EXTENSION_BY_TYPE[download.contentType] ?? 'bin';
  res.set({
    'Content-Type': download.contentType,
    'Content-Length': String(download.sizeBytes),
    'Content-Disposition': `inline; filename="salary-slip.${extension}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': SALARY_SLIP_CSP,
  });
  await pipeline(download.stream, res);
}

export async function uploadSalarySlip(req: Request, res: Response) {
  if (!req.file) {
    throw new AppError(400, 'FILE_REQUIRED', 'Choose a file to upload.');
  }
  const salarySlip = await uploadsService.uploadSalarySlip(getAuthUser(req).id, req.file);
  sendSuccess(res, 201, { salarySlip });
}

export async function downloadOwnSalarySlip(req: Request, res: Response) {
  await sendSalarySlip(res, await uploadsService.openOwnSalarySlip(getAuthUser(req).id));
}

export async function downloadLoanSalarySlip(req: Request<LoanIdParams>, res: Response) {
  const download = await uploadsService.openLoanSalarySlip(getAuthUser(req), req.params.loanId);
  await sendSalarySlip(res, download);
}
