import type { RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { MAX_UPLOAD_BYTES } from '../config/constants.js';
import { AppError } from '../utils/app-error.js';

// Memory storage: Render's disk is ephemeral, files go straight to GridFS. Tight limits stop
// oversized or oddly shaped multipart requests early. No fileFilter on purpose: the type is
// checked after upload, against the file's magic bytes (see uploads/salary-slip-file.ts).
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 1 },
});

/**
 * Every error from the multipart parser is the client's: too large, too many parts, or a body
 * that isn't valid multipart at all (no boundary, truncated, a broken part header).
 */
function toUploadError(error: unknown): AppError {
  if (error instanceof MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return new AppError(413, 'FILE_TOO_LARGE', 'The file must be 5 MB or smaller.');
  }
  return new AppError(400, 'INVALID_UPLOAD', 'Send exactly one file in the "file" field.');
}

/** Parses a multipart upload with one file. Mount after authenticate + requireRole. */
export function uploadSingleFile(fieldName: string): RequestHandler {
  const parse = memoryUpload.single(fieldName);
  return (req, res, next) => {
    parse(req, res, (error: unknown) => {
      next(error ? toUploadError(error) : undefined);
    });
  };
}
