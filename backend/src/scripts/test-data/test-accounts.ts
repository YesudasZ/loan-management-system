import { PAISE_PER_RUPEE, type EmploymentMode, type Role } from '../../config/constants.js';
import type { CalendarDate } from '../../utils/dates.js';
import type { LoanStatus } from '../../utils/loan-state-machine.js';

// Test accounts for manual QA (docs/TEST_ACCOUNTS.md). Names are realistic; every PAN is
// fictitious (4th letter P for an individual, 5th letter the surname's initial).

/** Every test account lives on this domain, so the test data can always be found and removed. */
export const TEST_EMAIL_DOMAIN = 'test.lms.dev';
/** Shared password for every test account. */
export const TEST_DATA_PASSWORD = 'Test@1234';
export const TEST_GROUP_SIZE = 5;

export type StaffRole = Exclude<Role, 'BORROWER'>;

export interface TestAccount {
  email: string;
  name: string;
  role: Role;
}

export interface TestProfile {
  fullName: string;
  pan: string;
  dateOfBirth: CalendarDate;
  monthlySalary: number; // paise
  employmentMode: EmploymentMode;
}

export function testEmail(localPart: string): string {
  return `${localPart}@${TEST_EMAIL_DOMAIN}`;
}

export function profile(
  fullName: string,
  pan: string,
  dateOfBirth: CalendarDate,
  monthlySalaryRupees: number,
  employmentMode: EmploymentMode = 'SALARIED',
): TestProfile {
  return {
    fullName,
    pan,
    dateOfBirth,
    monthlySalary: monthlySalaryRupees * PAISE_PER_RUPEE,
    employmentMode,
  };
}

// ── Staff: admin1–5, sales1–5, sanction1–5, disbursement1–5, collection1–5 ──

const STAFF_NAMES: Record<StaffRole, readonly string[]> = {
  ADMIN: ['Ananya Krishnamurthy', 'Rohit Kapoor', 'Sunita Reddy', 'Vivek Chandra', 'Neha Bhatt'],
  SALES: ['Amit Saini', 'Ritika Arora', 'Deepak Nair', 'Swati Kulkarni', 'Mohit Jain'],
  SANCTION: ['Shalini Menon', 'Rajesh Iyer', 'Preeti Sharma', 'Naveen Kumar', 'Asha Pillai'],
  DISBURSEMENT: ['Suresh Babu', 'Kirti Joshi', 'Arvind Rao', 'Megha Das', 'Prakash Patil'],
  COLLECTION: ['Lata Hegde', 'Sanjay Gupta', 'Rekha Nambiar', 'Ajay Thakur', 'Pooja Mehra'],
};

const STAFF_ROLES: readonly StaffRole[] = [
  'ADMIN',
  'SALES',
  'SANCTION',
  'DISBURSEMENT',
  'COLLECTION',
];

export const TEST_STAFF: TestAccount[] = STAFF_ROLES.flatMap((role) =>
  STAFF_NAMES[role].map((name, index) => ({
    email: testEmail(`${role.toLowerCase()}${index + 1}`),
    name,
    role,
  })),
);

// ── Borrowers: 5 groups of 5, named after the status of their current (latest) loan ──

export const CURRENT_LOAN_GROUPS = [
  'APPLIED',
  'SANCTIONED',
  'DISBURSED',
  'CLOSED',
  'REJECTED',
] as const satisfies readonly LoanStatus[];
export type CurrentLoanGroup = (typeof CURRENT_LOAN_GROUPS)[number];

export interface TestBorrower extends TestAccount {
  group: CurrentLoanGroup;
  /** 0–24 across all groups; varies the loan amounts, tenures and dates. */
  ordinal: number;
  /** 0–4 within the group. */
  indexInGroup: number;
  profile: TestProfile;
}

const BORROWER_PROFILES: Record<CurrentLoanGroup, readonly TestProfile[]> = {
  APPLIED: [
    profile('Aarav Sharma', 'BQRPS4821K', '1991-03-14', 65_000),
    profile('Diya Patel', 'CMNPP3917L', '1995-08-22', 52_000),
    profile('Kabir Reddy', 'DKLPR6604M', '1988-12-05', 88_000, 'SELF_EMPLOYED'),
    profile('Meera Nair', 'EHTPN2258N', '1993-06-30', 47_000),
    profile('Arjun Malhotra', 'FJWPM7712P', '1986-10-17', 120_000),
  ],
  SANCTIONED: [
    profile('Ishaan Gupta', 'GRBPG4436Q', '1992-02-09', 58_000),
    profile('Saanvi Iyer', 'HSKPI9081R', '1997-04-25', 41_000),
    profile('Vihaan Joshi', 'JTLPJ5523S', '1990-09-13', 76_000, 'SELF_EMPLOYED'),
    profile('Anika Menon', 'KVNPM1849T', '1994-11-28', 63_000),
    profile('Reyansh Kulkarni', 'LWDPK8365U', '1987-07-04', 95_000),
  ],
  DISBURSED: [
    profile('Aditi Banerjee', 'MXEPB2794V', '1993-01-19', 54_000),
    profile('Siddharth Rao', 'NYFPR6150W', '1989-05-07', 105_000),
    profile('Tara Chatterjee', 'PZGPC3387X', '1996-03-21', 44_000),
    profile('Karan Bhatia', 'QAHPB7026Y', '1991-08-15', 82_000, 'SELF_EMPLOYED'),
    profile('Nisha Pillai', 'RBJPP4672Z', '1995-12-02', 49_000),
  ],
  CLOSED: [
    profile('Rohan Verma', 'SCKPV1938A', '1990-04-11', 70_000),
    profile('Priya Krishnan', 'TDLPK5204B', '1992-10-26', 61_000),
    profile('Aniket Deshpande', 'UEMPD8471C', '1988-06-08', 99_000),
    profile('Sneha Mukherjee', 'VFNPM2615D', '1994-02-14', 46_000),
    profile('Varun Sinha', 'WGPPS6853E', '1987-09-29', 135_000, 'SELF_EMPLOYED'),
  ],
  REJECTED: [
    profile('Lakshmi Subramanian', 'XHQPS3096F', '1991-07-23', 57_000),
    profile('Harsh Agarwal', 'YJRPA7342G', '1996-01-05', 39_000),
    profile('Kavya Shetty', 'ZKSPS1587H', '1993-05-18', 68_000),
    profile('Manish Tiwari', 'ALTPT9728J', '1989-11-09', 84_000, 'SELF_EMPLOYED'),
    profile('Ritu Saxena', 'BMUPS4963K', '1995-09-01', 43_000),
  ],
};

export const TEST_BORROWERS: TestBorrower[] = CURRENT_LOAN_GROUPS.flatMap((group, groupIndex) =>
  BORROWER_PROFILES[group].map((borrowerProfile, indexInGroup) => ({
    email: testEmail(`${group.toLowerCase()}${indexInGroup + 1}`),
    name: borrowerProfile.fullName,
    role: 'BORROWER' as const,
    group,
    ordinal: groupIndex * TEST_GROUP_SIZE + indexInGroup,
    indexInGroup,
    profile: borrowerProfile,
  })),
);
