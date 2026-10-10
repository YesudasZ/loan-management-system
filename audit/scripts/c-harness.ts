// Lens C evidence copy: the shared helper the c*.ts scripts import as ./c-harness.js. Keep it next to them, one folder below backend/.
// Lens C audit harness: in-memory replica set + small result logger. Audit-only, not app code.
import { startTestDatabase, stopTestDatabase, clearTestDatabase } from '../tests/helpers/test-database.js';

export { startTestDatabase, stopTestDatabase, clearTestDatabase };

let failures = 0;

/** Prints PASS/FAIL with a label and evidence string. */
export function check(label: string, ok: boolean, evidence: unknown = ''): void {
  if (!ok) failures += 1;
  const text = typeof evidence === 'string' ? evidence : JSON.stringify(evidence);
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} | ${label} | ${text}\n`);
}

export function note(label: string, evidence: unknown = ''): void {
  const text = typeof evidence === 'string' ? evidence : JSON.stringify(evidence);
  process.stdout.write(`INFO | ${label} | ${text}\n`);
}

export function summary(): void {
  process.stdout.write(`\nTOTAL FAIL: ${failures}\n`);
}

export const ORIGIN = 'http://localhost:3000';
