import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import mongoose, { Types } from 'mongoose';
import { SALARY_SLIP_BUCKET } from '../../config/constants.js';

// Salary slips live in GridFS (bucket "salary_slips"), because Render's disk is wiped on deploy.

function getBucket(): mongoose.mongo.GridFSBucket {
  const database = mongoose.connection.db;
  if (!database) {
    throw new Error('Database is not connected');
  }
  return new mongoose.mongo.GridFSBucket(database, { bucketName: SALARY_SLIP_BUCKET });
}

interface StoreOptions {
  ownerId: string;
  extension: string;
  contentType: string;
}

/** Stores the file under a generated name (never the user's) and returns its id. */
export async function storeSalarySlipFile(
  buffer: Buffer,
  options: StoreOptions,
): Promise<Types.ObjectId> {
  const upload = getBucket().openUploadStream(`${randomUUID()}.${options.extension}`, {
    metadata: { ownerId: new Types.ObjectId(options.ownerId), contentType: options.contentType },
  });
  await pipeline(Readable.from(buffer), upload);
  return upload.id;
}

export async function salarySlipFileExists(fileId: Types.ObjectId): Promise<boolean> {
  const file = await getBucket().find({ _id: fileId }).limit(1).next();
  return file !== null;
}

export function openSalarySlipStream(fileId: Types.ObjectId): Readable {
  return getBucket().openDownloadStream(fileId);
}

export async function deleteSalarySlipFile(fileId: Types.ObjectId): Promise<void> {
  await getBucket().delete(fileId);
}

/** Deletes every slip uploaded by these users (the seeds' resets) and returns how many. */
export async function deleteSalarySlipFilesOwnedBy(ownerIds: Types.ObjectId[]): Promise<number> {
  const bucket = getBucket();
  const files = await bucket.find({ 'metadata.ownerId': { $in: ownerIds } }).toArray();
  await Promise.all(files.map((file) => bucket.delete(file._id)));
  return files.length;
}
