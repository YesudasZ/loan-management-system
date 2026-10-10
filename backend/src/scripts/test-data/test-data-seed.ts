import bcrypt from 'bcrypt';
import mongoose, { type Types } from 'mongoose';
import { BCRYPT_COST } from '../../config/constants.js';
import {
  BorrowerProfileModel,
  type BorrowerProfile,
  type StoredSalarySlip,
} from '../../models/borrower-profile.model.js';
import { LoanModel } from '../../models/loan.model.js';
import { PaymentModel, type Payment } from '../../models/payment.model.js';
import { UserModel } from '../../models/user.model.js';
import { storeSalarySlipFile } from '../../modules/uploads/salary-slip-storage.js';
import { evaluateEligibility } from '../../utils/bre.js';
import { calendarDateToUtcMidnight, toBusinessDate } from '../../utils/dates.js';
import { createSampleSalarySlipPdf } from '../sample-salary-slip.js';
import { buildLoanHistory } from './loan-history.js';
import { createStaffRotation } from './staff-rotation.js';
import {
  TEST_BORROWERS,
  TEST_DATA_PASSWORD,
  TEST_STAFF,
  type TestAccount,
  type TestProfile,
} from './test-accounts.js';
import { deleteDataOwnedBy, findTestUserIds, type TestDataCounts } from './test-data-cleanup.js';
import type { PickActor, SeedLoan } from './test-data-types.js';
import { TEST_LEADS } from './test-leads.js';
import { borrowerRegisteredAt, planBorrowerLoans } from './test-loan-plans.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const STAFF_SINCE_DAYS_AGO = 90;
/** Every test payment's UTR starts with this. */
export const TEST_UTR_PREFIX = 'TEST';

export const ALL_TEST_ACCOUNTS: TestAccount[] = [...TEST_STAFF, ...TEST_BORROWERS, ...TEST_LEADS];

type IdsByEmail = ReadonlyMap<string, Types.ObjectId>;

interface TestDocuments {
  profiles: BorrowerProfile[];
  loans: SeedLoan[];
  payments: Payment[];
  salarySlips: number;
}

const hoursAfter = (instant: Date, hours: number) => new Date(instant.getTime() + hours * HOUR_MS);

function registeredAt(email: string, now: Date): Date {
  const borrower = TEST_BORROWERS.find((candidate) => candidate.email === email);
  if (borrower) return borrowerRegisteredAt(borrower, now);
  const lead = TEST_LEADS.find((candidate) => candidate.email === email);
  const days = lead ? lead.registeredDaysAgo : STAFF_SINCE_DAYS_AGO;
  return new Date(now.getTime() - days * DAY_MS);
}

/** Upserts every test account by email (ids stay stable across runs) and returns their ids. */
async function upsertTestAccounts(now: Date): Promise<IdsByEmail> {
  const passwordHash = await bcrypt.hash(TEST_DATA_PASSWORD, BCRYPT_COST);
  await UserModel.bulkWrite(
    ALL_TEST_ACCOUNTS.map((account) => {
      const createdAt = registeredAt(account.email, now);
      return {
        updateOne: {
          filter: { email: account.email },
          update: {
            $set: {
              name: account.name,
              role: account.role,
              passwordHash,
              createdAt,
              updatedAt: createdAt,
            },
          },
          upsert: true,
          timestamps: false, // keeps the backdated sign-up dates
        },
      };
    }),
  );
  const users = await UserModel.find({
    email: mongoose.trusted({ $in: ALL_TEST_ACCOUNTS.map((account) => account.email) }),
  });
  return new Map(users.map((user) => [user.email, user._id]));
}

function idFor(ids: IdsByEmail, email: string): Types.ObjectId {
  const id = ids.get(email);
  if (!id) throw new Error(`Test account ${email} is missing`);
  return id;
}

async function storeGeneratedSlip(
  ownerId: Types.ObjectId,
  name: string,
  uploadedAt: Date,
): Promise<StoredSalarySlip> {
  const buffer = createSampleSalarySlipPdf(name);
  const fileId = await storeSalarySlipFile(buffer, {
    ownerId: ownerId.toString(),
    extension: 'pdf',
    contentType: 'application/pdf',
  });
  return { fileId, contentType: 'application/pdf', sizeBytes: buffer.length, uploadedAt };
}

function buildProfile(
  userId: Types.ObjectId,
  profile: TestProfile,
  createdAt: Date,
  salarySlip: StoredSalarySlip | null,
): BorrowerProfile {
  const breResult = evaluateEligibility(profile, toBusinessDate(createdAt));
  return {
    userId,
    ...profile,
    dateOfBirth: calendarDateToUtcMidnight(profile.dateOfBirth),
    breResult: { ...breResult, checkedAt: createdAt },
    salarySlip,
    createdAt,
    updatedAt: salarySlip?.uploadedAt ?? createdAt,
  };
}

/** Each borrower: a profile an hour after sign-up, a slip an hour later, then five loans. */
async function addBorrowers(ids: IdsByEmail, now: Date, documents: TestDocuments): Promise<void> {
  const staff = TEST_STAFF.map((account) => ({
    id: idFor(ids, account.email),
    role: account.role,
  }));
  const pickActor: PickActor = createStaffRotation(staff);
  let utrCounter = 0;
  const nextUtr = () => `${TEST_UTR_PREFIX}${String((utrCounter += 1)).padStart(8, '0')}`;

  for (const borrower of TEST_BORROWERS) {
    const borrowerId = idFor(ids, borrower.email);
    const profileAt = hoursAfter(borrowerRegisteredAt(borrower, now), 1);
    const salarySlip = await storeGeneratedSlip(
      borrowerId,
      borrower.name,
      hoursAfter(profileAt, 1),
    );
    documents.salarySlips += 1;
    documents.profiles.push(buildProfile(borrowerId, borrower.profile, profileAt, salarySlip));

    const context = { borrowerId, profile: borrower.profile, salarySlip, pickActor, nextUtr, now };
    for (const built of buildLoanHistory(context, planBorrowerLoans(borrower, now))) {
      documents.loans.push(built.loan);
      documents.payments.push(...built.payments);
    }
  }
}

/** Leads have no loans; some have a profile (eligible or not) and some a salary slip too. */
async function addLeads(ids: IdsByEmail, now: Date, documents: TestDocuments): Promise<void> {
  for (const lead of TEST_LEADS) {
    if (!lead.profile) continue;
    const leadId = idFor(ids, lead.email);
    const profileAt = hoursAfter(registeredAt(lead.email, now), 1);
    const salarySlip = lead.hasSalarySlip
      ? await storeGeneratedSlip(leadId, lead.name, hoursAfter(profileAt, 1))
      : null;
    if (salarySlip) documents.salarySlips += 1;
    documents.profiles.push(buildProfile(leadId, lead.profile, profileAt, salarySlip));
  }
}

/**
 * Adds the test data in docs/TEST_ACCOUNTS.md: 25 staff, 25 borrowers with five loans each and
 * 10 Sales leads, all on @test.lms.dev. Idempotent: the test accounts' old data is deleted
 * first, so every run ends in the same state. Demo (@lms.dev) and real accounts are untouched.
 */
export async function seedTestData(now: Date = new Date()): Promise<TestDataCounts> {
  const ids = await upsertTestAccounts(now);
  await deleteDataOwnedBy(await findTestUserIds());

  const documents: TestDocuments = { profiles: [], loans: [], payments: [], salarySlips: 0 };
  await addBorrowers(ids, now, documents);
  await addLeads(ids, now, documents);

  // timestamps: false keeps the backdated createdAt/updatedAt; documents are still validated.
  await BorrowerProfileModel.insertMany(documents.profiles, { timestamps: false });
  await LoanModel.insertMany(documents.loans, { timestamps: false });
  await PaymentModel.insertMany(documents.payments, { timestamps: false });

  return {
    users: ids.size,
    profiles: documents.profiles.length,
    salarySlips: documents.salarySlips,
    loans: documents.loans.length,
    payments: documents.payments.length,
  };
}
