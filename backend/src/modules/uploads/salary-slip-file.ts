import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from '../../config/constants.js';
import { AppError } from '../../utils/app-error.js';

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

export interface AcceptedFile {
  extension: string; // normalised: pdf | jpg | png
  contentType: string;
}

/**
 * Accepts only real PDF, JPG and PNG files. The extension, the browser-declared MIME type AND
 * the type detected from the file's magic bytes must all agree: a renamed .exe or an HTML page
 * called slip.pdf is rejected. The user's filename is used for this check only, never stored.
 */
export async function checkSalarySlipFile(file: UploadedFile): Promise<AcceptedFile> {
  if (file.buffer.length > MAX_UPLOAD_BYTES) {
    throw new AppError(413, 'FILE_TOO_LARGE', 'The file must be 5 MB or smaller.');
  }

  const extension = path.extname(file.originalname).slice(1).toLowerCase();
  const expectedType = ALLOWED_UPLOAD_TYPES[extension];
  const detected = await fileTypeFromBuffer(file.buffer);

  if (!expectedType || file.mimetype !== expectedType || detected?.mime !== expectedType) {
    throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'Upload a PDF, JPG or PNG file.');
  }
  return { extension: detected.ext, contentType: expectedType };
}
