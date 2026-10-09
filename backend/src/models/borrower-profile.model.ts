import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { EMPLOYMENT_MODES, type EmploymentMode } from '../config/constants.js';
import type { BreRule } from '../utils/bre.js';

export interface StoredBreResult {
  isEligible: boolean;
  failures: { rule: BreRule; message: string }[];
  checkedAt: Date;
}

export interface StoredSalarySlip {
  fileId: Types.ObjectId; // GridFS file in the salary_slips bucket
  contentType: string; // detected from the file's magic bytes
  sizeBytes: number;
  uploadedAt: Date;
}

export interface BorrowerProfile {
  userId: Types.ObjectId;
  fullName: string;
  pan: string;
  dateOfBirth: Date; // UTC midnight of the calendar date
  monthlySalary: number; // paise
  employmentMode: EmploymentMode;
  breResult: StoredBreResult;
  salarySlip: StoredSalarySlip | null;
  createdAt: Date;
  updatedAt: Date;
}

export type BorrowerProfileDocument = HydratedDocument<BorrowerProfile>;

export const breResultSchema = new Schema<StoredBreResult>(
  {
    isEligible: { type: Boolean, required: true },
    failures: [
      {
        _id: false,
        rule: { type: String, enum: ['AGE', 'SALARY', 'PAN', 'EMPLOYMENT'], required: true },
        message: { type: String, required: true },
      },
    ],
    checkedAt: { type: Date, required: true },
  },
  { _id: false },
);

export const salarySlipSchema = new Schema<StoredSalarySlip>(
  {
    fileId: { type: Schema.Types.ObjectId, required: true },
    contentType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    uploadedAt: { type: Date, required: true },
  },
  { _id: false },
);

const borrowerProfileSchema = new Schema<BorrowerProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    fullName: { type: String, required: true, trim: true },
    // Saved even when its format is invalid: a failed BRE is kept for Sales lead tracking.
    pan: { type: String, required: true, trim: true, uppercase: true },
    dateOfBirth: { type: Date, required: true },
    monthlySalary: { type: Number, required: true, min: 0 },
    employmentMode: { type: String, enum: [...EMPLOYMENT_MODES], required: true },
    breResult: { type: breResultSchema, required: true },
    salarySlip: { type: salarySlipSchema, default: null },
  },
  { collection: 'borrower_profiles', timestamps: true },
);

export const BorrowerProfileModel = model<BorrowerProfile>(
  'BorrowerProfile',
  borrowerProfileSchema,
);
