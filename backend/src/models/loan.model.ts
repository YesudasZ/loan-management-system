import { model, Schema, type HydratedDocument, type Types } from 'mongoose';
import { EMPLOYMENT_MODES, ROLES, type EmploymentMode, type Role } from '../config/constants.js';
import {
  ACTIVE_LOAN_STATUSES,
  LOAN_STATUSES,
  type LoanStatus,
} from '../utils/loan-state-machine.js';
import {
  breResultSchema,
  salarySlipSchema,
  type StoredBreResult,
  type StoredSalarySlip,
} from './borrower-profile.model.js';

/** The borrower's details frozen at apply time; later profile edits don't rewrite history. */
export interface ApplicantSnapshot {
  fullName: string;
  pan: string;
  dateOfBirth: Date;
  monthlySalary: number; // paise
  employmentMode: EmploymentMode;
  breResult: StoredBreResult; // the BRE result evaluated at apply time
}

export interface StatusHistoryEntry {
  from: LoanStatus | null; // null for the first entry (the application itself)
  to: LoanStatus;
  by: Types.ObjectId;
  byRole: Role; // lets borrowers see who acted without exposing staff ids
  at: Date;
  note?: string;
}

export interface Loan {
  borrowerId: Types.ObjectId;
  principal: number; // paise
  tenureDays: number;
  annualInterestRate: number; // percent, snapshot of the server constant
  simpleInterest: number; // paise
  totalRepayment: number; // paise
  totalPaid: number; // paise; changed only inside the payment transaction
  status: LoanStatus;
  applicant: ApplicantSnapshot;
  salarySlip: StoredSalarySlip;
  rejectionReason?: string;
  disbursedAt?: Date;
  disbursedBy?: Types.ObjectId;
  closedAt?: Date;
  statusHistory: StatusHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

export type LoanDocument = HydratedDocument<Loan>;

const applicantSchema = new Schema<ApplicantSnapshot>(
  {
    fullName: { type: String, required: true },
    pan: { type: String, required: true },
    dateOfBirth: { type: Date, required: true },
    monthlySalary: { type: Number, required: true },
    employmentMode: { type: String, enum: [...EMPLOYMENT_MODES], required: true },
    breResult: { type: breResultSchema, required: true },
  },
  { _id: false },
);

const statusHistorySchema = new Schema<StatusHistoryEntry>(
  {
    from: { type: String, enum: [...LOAN_STATUSES], default: null },
    to: { type: String, enum: [...LOAN_STATUSES], required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    byRole: { type: String, enum: [...ROLES], required: true },
    at: { type: Date, required: true },
    note: { type: String },
  },
  { _id: false },
);

const loanSchema = new Schema<Loan>(
  {
    borrowerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    principal: { type: Number, required: true },
    tenureDays: { type: Number, required: true },
    annualInterestRate: { type: Number, required: true },
    simpleInterest: { type: Number, required: true },
    totalRepayment: { type: Number, required: true },
    totalPaid: { type: Number, required: true, default: 0 },
    status: { type: String, enum: [...LOAN_STATUSES], required: true },
    applicant: { type: applicantSchema, required: true },
    salarySlip: { type: salarySlipSchema, required: true },
    rejectionReason: { type: String },
    disbursedAt: { type: Date },
    disbursedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    closedAt: { type: Date },
    statusHistory: { type: [statusHistorySchema], required: true },
  },
  { collection: 'loans', timestamps: true },
);

// Module work queues, newest first (with _id as a stable tiebreak for pagination).
loanSchema.index({ status: 1, createdAt: -1, _id: -1 });
// A borrower's own loans, and the Sales "no loan yet" lookup.
loanSchema.index({ borrowerId: 1, createdAt: -1, _id: -1 });
// "At most one active loan per borrower", enforced by the database even when requests race.
loanSchema.index(
  { borrowerId: 1 },
  {
    name: 'one_active_loan_per_borrower',
    unique: true,
    partialFilterExpression: { status: { $in: [...ACTIVE_LOAN_STATUSES] } },
  },
);

export const LoanModel = model<Loan>('Loan', loanSchema);
