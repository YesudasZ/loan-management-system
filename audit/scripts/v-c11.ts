// P1 verifier evidence copy. To re-run: mkdir backend/audit-tmp-v && cp audit/scripts/v-*.ts backend/audit-tmp-v/ && cp audit/scripts/d-harness.ts backend/audit-tmp-v/harness.ts, then from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-v/<file>.ts
// P1 verifier: C-11 env validation accepts weak/placeholder secrets and "null" origins.
import { parseEnv } from '../src/config/env.js';
const base = { NODE_ENV: 'production', MONGODB_URI: 'mongodb://127.0.0.1:27017/x', CORS_ORIGINS: 'http://localhost:3000', TRUST_PROXY_HOPS: '1' };
const cases: Record<string, Record<string, string>> = {
  'placeholder from .env.example': { JWT_SECRET: 'change-me-to-at-least-32-random-characters' },
  '32 x "a"': { JWT_SECRET: 'a'.repeat(32) },
  '32 spaces': { JWT_SECRET: ' '.repeat(32) },
  '31 chars (control)': { JWT_SECRET: 'a'.repeat(31) },
  'CORS localhost:3000 (no scheme)': { JWT_SECRET: 'x'.repeat(40), CORS_ORIGINS: 'localhost:3000' },
  'CORS file:///x': { JWT_SECRET: 'x'.repeat(40), CORS_ORIGINS: 'file:///x' },
};
for (const [label, extra] of Object.entries(cases)) {
  try {
    const env = parseEnv({ ...base, ...extra });
    console.log(`ACCEPTED  ${label}  CORS_ORIGINS=${JSON.stringify(env.CORS_ORIGINS)}`);
  } catch (error) {
    console.log(`REJECTED  ${label}: ${(error as Error).message.split('\n')[1]?.trim()}`);
  }
}
