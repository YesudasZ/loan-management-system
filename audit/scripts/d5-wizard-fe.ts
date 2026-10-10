// Lens D5 (frontend part): getWizardRedirect for every page × every progress snapshot from
// d5-wizard.ts. Run with the frontend tsconfig so the `@/` alias resolves.
import { readFileSync } from 'node:fs';
import { getStepPath, getWizardRedirect } from '../../frontend/src/lib/wizard.ts';
import type { BorrowerProgress, WizardStep } from '../../frontend/src/types/loan.ts';

const file = process.env.D5_OUT ?? '/tmp/d5-progress.json';
const snapshots = JSON.parse(readFileSync(file, 'utf8')) as Record<string, BorrowerProgress>;
const PAGES: WizardStep[] = ['PROFILE', 'SALARY_SLIP', 'LOAN', 'STATUS'];

// Expected: the page renders (null) or redirects to a path.
const EXPECTED: Record<string, Record<WizardStep, string | null>> = {
  'new user': { PROFILE: null, SALARY_SLIP: '/apply/profile', LOAN: '/apply/profile', STATUS: '/apply/profile' },
  'BRE failed': { PROFILE: null, SALARY_SLIP: '/apply/profile', LOAN: '/apply/profile', STATUS: '/apply/profile' },
  'eligible, no slip': { PROFILE: null, SALARY_SLIP: null, LOAN: '/apply/salary-slip', STATUS: '/apply/salary-slip' },
  'eligible with slip': { PROFILE: null, SALARY_SLIP: null, LOAN: null, STATUS: '/apply/loan' },
  'slip uploaded, then BRE failed': { PROFILE: null, SALARY_SLIP: '/apply/profile', LOAN: '/apply/profile', STATUS: '/apply/profile' },
  'fixed again (slip kept)': { PROFILE: null, SALARY_SLIP: null, LOAN: null, STATUS: '/apply/loan' },
  applied: { PROFILE: '/apply/status', SALARY_SLIP: '/apply/status', LOAN: '/apply/status', STATUS: null },
  'after REJECTED': { PROFILE: null, SALARY_SLIP: null, LOAN: null, STATUS: null },
  're-applied after REJECTED': { PROFILE: '/apply/status', SALARY_SLIP: '/apply/status', LOAN: '/apply/status', STATUS: null },
  'after CLOSED': { PROFILE: null, SALARY_SLIP: null, LOAN: null, STATUS: null },
};

let failures = 0;
for (const [label, progress] of Object.entries(snapshots)) {
  const expected = EXPECTED[label];
  const actual = Object.fromEntries(PAGES.map((page) => [page, getWizardRedirect(page, progress)]));
  const resume = getStepPath(progress.currentStep);
  const ok = expected !== undefined && PAGES.every((page) => actual[page] === expected[page]);
  // The /apply resume target must itself render (no redirect loop).
  const resumeRenders = getWizardRedirect(progress.currentStep, progress) === null;
  if (!ok || !resumeRenders) failures += 1;
  process.stdout.write(`${ok && resumeRenders ? 'PASS' : 'FAIL'} ${label}: currentStep=${progress.currentStep} → /apply resumes at ${resume} (renders: ${resumeRenders}); redirects ${JSON.stringify(actual)}\n`);
}
process.stdout.write(`\nfailures=${failures}\n`);
process.exitCode = failures > 0 ? 1 : 0;
