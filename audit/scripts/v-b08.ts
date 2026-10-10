// P1 verifier evidence copy. To re-run: mkdir backend/audit-tmp-v && cp audit/scripts/v-*.ts backend/audit-tmp-v/ && cp audit/scripts/d-harness.ts backend/audit-tmp-v/harness.ts, then from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-v/<file>.ts
// P1 verifier: B-08 open redirect via ?next= using the real getSafeNextPath.
import assert from 'node:assert/strict';
import { getSafeNextPath } from '../../frontend/src/lib/route-access.ts';
import type { Role } from '../../frontend/src/lib/constants.ts';

const roles: Role[] = ['BORROWER', 'SALES', 'SANCTION', 'ADMIN'];
const bad = ['/.//evil.com', '/..//evil.com', '/x/..//evil.com', '/apply/..//evil.com', '/%2e//evil.com', '/%2E%2E//evil.com', '/././/evil.com/path?q=1'];
const blocked = ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)'];
let escapes = 0;
for (const role of roles) {
  for (const next of bad) {
    const out = getSafeNextPath(next, role);
    const target = new URL(out, 'https://lms.example/login?next=x').href;
    const left = new URL(target).origin !== 'https://lms.example';
    if (left) escapes++;
    console.log(`${role.padEnd(9)} ${JSON.stringify(next).padEnd(26)} -> ${JSON.stringify(out).padEnd(22)} -> ${target}${left ? '   LEAVES SITE' : ''}`);
  }
  for (const next of blocked) {
    const out = getSafeNextPath(next, role);
    assert.ok(!out.startsWith('//'), `blocked vector ${next} not blocked`);
    console.log(`${role.padEnd(9)} ${JSON.stringify(next).padEnd(26)} -> ${JSON.stringify(out)} (blocked as intended)`);
  }
}
console.log(`\nescaping results: ${escapes} of ${roles.length * bad.length}`);
