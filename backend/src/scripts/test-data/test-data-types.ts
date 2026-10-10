import type { Types } from 'mongoose';
import type { Role } from '../../config/constants.js';
import type { StoredSalarySlip } from '../../models/borrower-profile.model.js';
import type { Loan } from '../../models/loan.model.js';
import type { Payment } from '../../models/payment.model.js';
import type { TestProfile } from './test-accounts.js';

export interface Actor {
  id: Types.ObjectId;
  role: Role;
}
export type StaffTask = 'REVIEW' | 'DISBURSE' | 'COLLECT';
export type PickActor = (task: StaffTask) => Actor;

/** Where a planned loan ends up (its status today) and what happened on the way. */
export type LoanOutcome =
  | { status: 'APPLIED' }
  | { status: 'REJECTED'; reason: string }
  | { status: 'SANCTIONED'; approvalNote?: string }
  | { status: 'DISBURSED'; approvalNote?: string; paymentShares: readonly number[] }
  | { status: 'CLOSED'; approvalNote?: string; paymentCount: number };

export interface LoanPlan {
  principal: number; // paise
  tenureDays: number;
  appliedAt: Date;
  outcome: LoanOutcome;
}

export interface LoanHistoryContext {
  borrowerId: Types.ObjectId;
  profile: TestProfile;
  salarySlip: StoredSalarySlip;
  pickActor: PickActor;
  nextUtr: () => string;
  now: Date;
}

export type SeedLoan = Loan & { _id: Types.ObjectId };
export interface BuiltLoan {
  loan: SeedLoan;
  payments: Payment[];
}
