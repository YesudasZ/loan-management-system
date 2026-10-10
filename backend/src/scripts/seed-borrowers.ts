import mongoose, { type Types } from 'mongoose';
import type { EmploymentMode } from '../config/constants.js';
import { BorrowerProfileModel } from '../models/borrower-profile.model.js';
import { LoanModel } from '../models/loan.model.js';
import { PaymentModel } from '../models/payment.model.js';
import { UserModel } from '../models/user.model.js';
import { saveProfile } from '../modules/borrower/borrower.service.js';
import { applyForLoan } from '../modules/loans/loans.service.js';
import { deleteSalarySlipFilesOwnedBy } from '../modules/uploads/salary-slip-storage.js';
import { uploadSalarySlip } from '../modules/uploads/uploads.service.js';
import { AppError } from '../utils/app-error.js';
import { createSampleSalarySlipPdf } from './sample-salary-slip.js';

interface DemoProfile {
  fullName: string;
  pan: string; // fictitious, format-valid unless the demo is a BRE failure
  dateOfBirth: string;
  monthlySalary: number; // paise
  employmentMode: EmploymentMode;
}

/** How far the demo loan is moved after it's applied for. */
export type DemoLoanOutcome = 'APPLIED' | 'SANCTIONED' | 'REJECTED' | 'DISBURSED' | 'CLOSED';

export interface DemoLoan {
  principal: number; // paise
  tenureDays: number;
  outcome: DemoLoanOutcome;
  /** DISBURSED only: record one payment of this share of the total (e.g. 0.4). */
  partialPaymentShare?: number;
}

export interface DemoBorrower {
  email: string;
  name: string;
  profile?: DemoProfile;
  hasSalarySlip?: boolean;
  loan?: DemoLoan;
}

const eligible = (fullName: string, pan: string): DemoProfile => ({
  fullName,
  pan,
  dateOfBirth: '1992-04-18',
  monthlySalary: 6_500_000, // ₹65,000
  employmentMode: 'SALARIED',
});

/** Each demo borrower sits at a different stage, so every module has data to show. */
export const DEMO_BORROWERS: DemoBorrower[] = [
  { email: 'borrower@lms.dev', name: 'Bala Borrower' }, // fresh: walk the whole wizard
  { email: 'lead.new@lms.dev', name: 'Neha New' },
  {
    email: 'lead.brefail@lms.dev',
    name: 'Bharat Brefail',
    profile: {
      fullName: 'Bharat Brefail',
      pan: 'BRFPL1234Q',
      dateOfBirth: '2005-03-15', // 21 years old in 2026
      monthlySalary: 4_000_000,
      employmentMode: 'UNEMPLOYED',
    },
  },
  {
    email: 'lead.noslip@lms.dev',
    name: 'Nikhil Noslip',
    profile: eligible('Nikhil Noslip', 'NKSPL4321K'),
  },
  {
    email: 'lead.ready@lms.dev',
    name: 'Radha Ready',
    profile: eligible('Radha Ready', 'RDHRY5678M'),
    hasSalarySlip: true,
  },
  {
    email: 'demo.applied1@lms.dev',
    name: 'Arjun Applied',
    profile: eligible('Arjun Applied', 'ARJAP1111A'),
    hasSalarySlip: true,
    loan: { principal: 10_000_000, tenureDays: 90, outcome: 'APPLIED' },
  },
  {
    email: 'demo.applied2@lms.dev',
    name: 'Anita Applied',
    profile: eligible('Anita Applied', 'ANTAP2222B'),
    hasSalarySlip: true,
    loan: { principal: 25_000_000, tenureDays: 180, outcome: 'APPLIED' },
  },
  {
    email: 'demo.sanctioned@lms.dev',
    name: 'Sameer Sanctioned',
    profile: eligible('Sameer Sanctioned', 'SMRSN3333C'),
    hasSalarySlip: true,
    loan: { principal: 15_000_000, tenureDays: 120, outcome: 'SANCTIONED' },
  },
  {
    email: 'demo.rejected@lms.dev',
    name: 'Rohit Rejected',
    profile: eligible('Rohit Rejected', 'RHTRJ4444D'),
    hasSalarySlip: true,
    loan: { principal: 40_000_000, tenureDays: 365, outcome: 'REJECTED' },
  },
  {
    email: 'demo.disbursed1@lms.dev',
    name: 'Divya Disbursed',
    profile: eligible('Divya Disbursed', 'DVYDS5555E'),
    hasSalarySlip: true,
    loan: { principal: 20_000_000, tenureDays: 150, outcome: 'DISBURSED' },
  },
  {
    email: 'demo.disbursed2@lms.dev',
    name: 'Deepak Disbursed',
    profile: eligible('Deepak Disbursed', 'DPKDS6666F'),
    hasSalarySlip: true,
    loan: { principal: 7_500_000, tenureDays: 60, outcome: 'DISBURSED', partialPaymentShare: 0.4 },
  },
  {
    email: 'demo.closed@lms.dev',
    name: 'Chitra Closed',
    profile: eligible('Chitra Closed', 'CHTCL7777G'),
    hasSalarySlip: true,
    loan: { principal: 5_000_000, tenureDays: 30, outcome: 'CLOSED' },
  },
];

/** Every seed payment's UTR starts with this, so a reset can always find them. */
export const SEED_UTR_PREFIX = 'SEED';

/** Removes the demo borrowers' payments, loans, slip files and profiles so each run starts clean. */
export async function resetDemoBorrowerData(userIds: Types.ObjectId[]): Promise<void> {
  // Server-built operators are marked trusted for sanitizeFilter.
  const loans = await LoanModel.find({ borrowerId: mongoose.trusted({ $in: userIds }) }).select(
    '_id',
  );
  await PaymentModel.deleteMany({
    $or: [
      { loanId: mongoose.trusted({ $in: loans.map((loan) => loan._id) }) },
      { utr: mongoose.trusted({ $regex: `^${SEED_UTR_PREFIX}` }) },
    ],
  });
  await LoanModel.deleteMany({ borrowerId: mongoose.trusted({ $in: userIds }) });
  await deleteSalarySlipFilesOwnedBy(userIds);
  await BorrowerProfileModel.deleteMany({ userId: mongoose.trusted({ $in: userIds }) });
}

async function saveDemoProfile(userId: string, profile: DemoProfile): Promise<void> {
  try {
    await saveProfile(userId, profile);
  } catch (error) {
    // A demo of a failed eligibility check is expected to fail; the profile is still saved.
    if (!(error instanceof AppError && error.code === 'BRE_FAILED')) throw error;
  }
}

/**
 * Builds a demo borrower through the real services, so the data follows the app's rules.
 * Returns the new loan's id when the demo applies for one.
 */
export async function seedDemoBorrower(demo: DemoBorrower): Promise<string | null> {
  const user = await UserModel.findOne({ email: demo.email });
  if (!user) throw new Error(`Seed user ${demo.email} is missing`);
  const userId = user._id.toString();

  if (demo.profile) {
    await saveDemoProfile(userId, demo.profile);
  }
  if (demo.hasSalarySlip) {
    await uploadSalarySlip(userId, {
      buffer: createSampleSalarySlipPdf(demo.name),
      originalname: 'salary-slip.pdf',
      mimetype: 'application/pdf',
    });
  }
  if (!demo.loan) {
    return null;
  }
  const loan = await applyForLoan(
    { id: userId, name: user.name, email: user.email, role: user.role },
    { principal: demo.loan.principal, tenureDays: demo.loan.tenureDays },
  );
  return loan.id;
}
