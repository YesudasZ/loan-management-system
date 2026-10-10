import type { LeadStage } from '../../utils/lead-stage.js';
import { profile, testEmail, type TestAccount, type TestProfile } from './test-accounts.js';

// Sales leads: registered borrowers with no loan, at every stage of the wizard.

export interface TestLead extends TestAccount {
  profile: TestProfile | null;
  hasSalarySlip: boolean;
  registeredDaysAgo: number;
  /** The stage the Sales module should show (checked by the tests). */
  expectedStage: LeadStage;
}

function lead(
  number: number,
  name: string,
  registeredDaysAgo: number,
  expectedStage: LeadStage,
  leadProfile: TestProfile | null = null,
): TestLead {
  return {
    email: testEmail(`lead${number}`),
    name,
    role: 'BORROWER',
    profile: leadProfile,
    hasSalarySlip: expectedStage === 'READY_TO_APPLY',
    registeredDaysAgo,
    expectedStage,
  };
}

export const TEST_LEADS: TestLead[] = [
  lead(1, 'Neel Kapoor', 2, 'PROFILE_PENDING'),
  // Fails AGE: born in 2005, so 21 in 2026.
  lead(
    2,
    'Zoya Qureshi',
    5,
    'BRE_FAILED',
    profile('Zoya Qureshi', 'ZQRPQ5532L', '2005-08-20', 32_000),
  ),
  lead(
    3,
    'Gaurav Yadav',
    9,
    'SALARY_SLIP_PENDING',
    profile('Gaurav Yadav', 'GYDPY7741M', '1993-11-02', 48_000),
  ),
  lead(
    4,
    'Pallavi Hegde',
    14,
    'READY_TO_APPLY',
    profile('Pallavi Hegde', 'PHGPH2290N', '1990-07-19', 72_000),
  ),
  // Fails SALARY: ₹18,000 a month.
  lead(
    5,
    'Imran Sheikh',
    18,
    'BRE_FAILED',
    profile('Imran Sheikh', 'IMSPS6612P', '1994-01-25', 18_000),
  ),
  lead(6, 'Shreya Bose', 23, 'PROFILE_PENDING'),
  // Fails PAN: not in the AAAAA9999A format.
  lead(
    7,
    'Abhishek Pandey',
    29,
    'BRE_FAILED',
    profile('Abhishek Pandey', 'ABC123', '1992-05-30', 55_000),
  ),
  // Fails AGE (over 50) and EMPLOYMENT.
  lead(
    8,
    'Divya Rangan',
    34,
    'BRE_FAILED',
    profile('Divya Rangan', 'DRGPR3345Q', '1970-02-11', 30_000, 'UNEMPLOYED'),
  ),
  lead(
    9,
    'Farhan Ali',
    41,
    'SALARY_SLIP_PENDING',
    profile('Farhan Ali', 'FALPA8823R', '1996-09-08', 38_000, 'SELF_EMPLOYED'),
  ),
  lead(
    10,
    'Tanvi Mishra',
    47,
    'READY_TO_APPLY',
    profile('Tanvi Mishra', 'TMSPM1167S', '1989-12-12', 90_000),
  ),
];
