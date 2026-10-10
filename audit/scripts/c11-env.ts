// Lens C evidence copy. The relative imports expect backend/<any-folder>/: to re-run, copy this file and c-harness.ts
// into e.g. backend/audit-tmp-c/ and run from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused
// JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-c/c11-env.ts
// C11: env validation (backend/src/config/env.ts) for missing and weak values. Pure, no database.
import { parseEnv } from '../src/config/env.js';
import { check, note, summary } from './c-harness.js';

const GOOD = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/unused',
  JWT_SECRET: 'audit-only-secret-0123456789abcdefghij',
  CORS_ORIGINS: 'http://localhost:3000',
};

function attempt(label: string, source: Record<string, string | undefined>, shouldThrow: boolean): void {
  try {
    const parsed = parseEnv(source as NodeJS.ProcessEnv);
    check(`${label} -> ${shouldThrow ? 'throws' : 'accepted'}`, !shouldThrow, `accepted CORS=${JSON.stringify(parsed.CORS_ORIGINS)} hops=${parsed.TRUST_PROXY_HOPS}`);
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/\n/g, ' ') : String(error);
    check(`${label} -> ${shouldThrow ? 'throws' : 'accepted'}`, shouldThrow, message.slice(0, 220));
  }
}

attempt('empty environment', {}, true);
attempt('good values', GOOD, false);
attempt('MONGODB_URI missing', { ...GOOD, MONGODB_URI: undefined }, true);
attempt('MONGODB_URI http://', { ...GOOD, MONGODB_URI: 'http://cluster.example.net' }, true);
attempt('JWT_SECRET missing', { ...GOOD, JWT_SECRET: undefined }, true);
attempt('JWT_SECRET 31 chars', { ...GOOD, JWT_SECRET: 'x'.repeat(31) }, true);
attempt('JWT_SECRET 32 chars', { ...GOOD, JWT_SECRET: 'x'.repeat(32) }, false);
attempt('CORS_ORIGINS missing', { ...GOOD, CORS_ORIGINS: undefined }, true);
attempt('CORS_ORIGINS empty', { ...GOOD, CORS_ORIGINS: '' }, true);
attempt('CORS_ORIGINS *', { ...GOOD, CORS_ORIGINS: '*' }, true);
attempt('CORS_ORIGINS not a URL', { ...GOOD, CORS_ORIGINS: 'localhost:3000x' }, true);
attempt('CORS_ORIGINS with path normalised', { ...GOOD, CORS_ORIGINS: 'https://app.example.com/login, http://localhost:3000/' }, false);
attempt('TRUST_PROXY_HOPS true', { ...GOOD, TRUST_PROXY_HOPS: 'true' }, true);
attempt('TRUST_PROXY_HOPS -1', { ...GOOD, TRUST_PROXY_HOPS: '-1' }, true);
attempt('TRUST_PROXY_HOPS 1.5', { ...GOOD, TRUST_PROXY_HOPS: '1.5' }, true);
attempt('NODE_ENV staging', { ...GOOD, NODE_ENV: 'staging' }, true);
attempt('LOG_LEVEL verbose', { ...GOOD, LOG_LEVEL: 'verbose' }, true);
attempt('PORT 0', { ...GOOD, PORT: '0' }, true);

// Weak values that are accepted (observations).
const weak: [string, Record<string, string>][] = [
  ['JWT_SECRET = the .env.example placeholder', { ...GOOD, JWT_SECRET: 'change-me-to-at-least-32-random-characters' }],
  ['JWT_SECRET = 32 spaces', { ...GOOD, JWT_SECRET: ' '.repeat(32) }],
  ['JWT_SECRET = "a" x 32', { ...GOOD, JWT_SECRET: 'a'.repeat(32) }],
  ['JWT_SECRET placeholder with NODE_ENV=production', { ...GOOD, NODE_ENV: 'production', JWT_SECRET: 'change-me-to-at-least-32-random-characters' }],
  ['MONGODB_URI = "mongodb://" (no host)', { ...GOOD, MONGODB_URI: 'mongodb://' }],
  ['MONGODB_URI = the .env.example placeholder', { ...GOOD, MONGODB_URI: 'mongodb+srv://change-me:change-me@cluster.example.mongodb.net/lms_dev?retryWrites=true&w=majority' }],
  ['CORS_ORIGINS = " , " (no origins)', { ...GOOD, CORS_ORIGINS: ' , ' }],
  ['CORS_ORIGINS = file:///x (origin "null")', { ...GOOD, CORS_ORIGINS: 'file:///x' }],
  ['CORS_ORIGINS http:// in production', { ...GOOD, NODE_ENV: 'production', CORS_ORIGINS: 'http://app.example.com' }],
];
for (const [label, source] of weak) {
  try {
    const parsed = parseEnv(source as NodeJS.ProcessEnv);
    note(`WEAK ACCEPTED: ${label}`, `CORS=${JSON.stringify(parsed.CORS_ORIGINS)}`);
  } catch (error) {
    note(`weak rejected: ${label}`, error instanceof Error ? error.message.replace(/\n/g, ' ').slice(0, 160) : String(error));
  }
}
summary();
