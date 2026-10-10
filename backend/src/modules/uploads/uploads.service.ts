import type { Readable } from 'node:stream';
import type { Types } from 'mongoose';
import { logger } from '../../config/logger.js';
import {
  BorrowerProfileModel,
  type StoredSalarySlip,
} from '../../models/borrower-profile.model.js';
import { AppError } from '../../utils/app-error.js';
import { toSalarySlipDto, type SalarySlipDto } from '../borrower/borrower.dto.js';
import type { AuthUser } from '../auth/auth.types.js';
import { findLoanForViewer } from '../loans/loan-operations.service.js';
import { assertNoActiveLoan, isSalarySlipInUse } from '../loans/loans.service.js';
import { checkSalarySlipFile, type UploadedFile } from './salary-slip-file.js';
import {
  deleteSalarySlipFile,
  openSalarySlipStream,
  salarySlipFileExists,
  storeSalarySlipFile,
} from './salary-slip-storage.js';

/** Deletes a replaced slip unless a loan application still points at it. Best effort. */
async function removeIfUnused(fileId: Types.ObjectId): Promise<void> {
  try {
    if (!(await isSalarySlipInUse(fileId))) {
      await deleteSalarySlipFile(fileId);
    }
  } catch (error) {
    logger.warn(
      { err: error, fileId: fileId.toString() },
      'Could not delete a replaced salary slip',
    );
  }
}

/**
 * Stores the borrower's salary slip and links it to their profile (replacing any previous one).
 * Requires an eligible profile and no active loan. GridFS writes can't join a transaction, so a
 * failed profile update deletes the new file again.
 */
export async function uploadSalarySlip(userId: string, file: UploadedFile): Promise<SalarySlipDto> {
  const profile = await BorrowerProfileModel.findOne({ userId });
  if (!profile?.breResult.isEligible) {
    throw new AppError(
      409,
      'PROFILE_INCOMPLETE',
      'Complete your personal details and pass the eligibility check first.',
    );
  }
  await assertNoActiveLoan(userId, 'Your salary slip is locked while you have an active loan.');

  const accepted = await checkSalarySlipFile(file);
  const fileId = await storeSalarySlipFile(file.buffer, { ownerId: userId, ...accepted });
  const previousSlip = profile.salarySlip;
  const salarySlip: StoredSalarySlip = {
    fileId,
    contentType: accepted.contentType,
    sizeBytes: file.buffer.length,
    uploadedAt: new Date(),
  };

  try {
    profile.salarySlip = salarySlip;
    await profile.save();
  } catch (error) {
    await deleteSalarySlipFile(fileId).catch((cleanupError: unknown) => {
      logger.warn({ err: cleanupError }, 'Could not delete an orphaned salary slip');
    });
    throw error;
  }

  if (previousSlip) {
    await removeIfUnused(previousSlip.fileId);
  }
  return toSalarySlipDto(salarySlip);
}

export interface SalarySlipDownload {
  contentType: string;
  sizeBytes: number;
  stream: Readable;
}

/** Opens a stored slip for download, or 404 if it no longer exists. */
export async function openSalarySlip(slip: StoredSalarySlip): Promise<SalarySlipDownload> {
  if (!(await salarySlipFileExists(slip.fileId))) {
    throw new AppError(404, 'NOT_FOUND', 'Salary slip not found');
  }
  return {
    contentType: slip.contentType,
    sizeBytes: slip.sizeBytes,
    stream: openSalarySlipStream(slip.fileId),
  };
}

/** The logged-in borrower's own slip: scoped by their user id, never by an id from the URL. */
export async function openOwnSalarySlip(userId: string): Promise<SalarySlipDownload> {
  const profile = await BorrowerProfileModel.findOne({ userId });
  if (!profile?.salarySlip) {
    throw new AppError(404, 'NOT_FOUND', 'No salary slip uploaded yet');
  }
  return openSalarySlip(profile.salarySlip);
}

/** Staff view of a loan's slip: only where the viewer may read the loan (SANCTION: APPLIED). */
export async function openLoanSalarySlip(
  viewer: AuthUser,
  loanId: string,
): Promise<SalarySlipDownload> {
  const loan = await findLoanForViewer(viewer, loanId);
  return openSalarySlip(loan.salarySlip);
}
