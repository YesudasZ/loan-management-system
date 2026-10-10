// Lens B evidence script. To re-run: copy it and b-harness.ts into backend/audit-tmp-b/ (imports are relative to that folder), then from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-b/<file>.ts
// B10: frontend route guard decisions (route-access.ts, used by proxy.ts), sidebar links, ?next= safety.
import { getAllowedModules, getHomePath, getSafeNextPath, resolveRouteAccess } from '../../frontend/src/lib/route-access.ts';
import { ROLES, type Role } from '../../frontend/src/lib/constants.ts';

const ID = '64b7f0c2a1b2c3d4e5f60718';
const pages = ['/login', '/signup', '/', '/apply', '/apply/profile', '/apply/salary-slip', '/apply/loan', '/apply/status',
  '/apply/loans', `/apply/loans/${ID}`, '/dashboard', '/dashboard/sales', '/dashboard/sanction', `/dashboard/sanction/${ID}`,
  '/dashboard/disbursement', '/dashboard/collection', `/dashboard/collection/${ID}`, '/dashboard/staff', '/forbidden',
  '/no-such-page', '/dashboard/', '/apply/', '/dashboardx', '/applyx', '/Dashboard/staff'];
const identities: (Role | null)[] = [null, ...ROLES];
const short = (d: ReturnType<typeof resolveRouteAccess>) => (d.type === 'allow' ? 'allow' : `→ ${d.to}`);
console.log(`| Page | ${identities.map((r) => r ?? 'ANON').join(' | ')} |`);
console.log(`| --- | ${identities.map(() => '---').join(' | ')} |`);
for (const page of pages) console.log(`| \`${page}\` | ${identities.map((r) => short(resolveRouteAccess(page, r))).join(' | ')} |`);

console.log('\nhome:', ROLES.map((r) => `${r}=${getHomePath(r)}`).join(', '));
for (const role of ROLES) {
  const links = getAllowedModules(role).map((m) => m.label);
  console.log(`sidebar ${role}: ${(role === 'ADMIN' ? ['Overview', ...links] : links).join(', ') || '(none)'}`);
}

// What the login page receives in `next` is already URL-decoded by Next's searchParams.
const nexts = ['//evil.com', '/\\evil.com', 'https://evil.com', '%2F%2Fevil.com', '/%2F%2Fevil.com', '\\\\evil.com', '/\tevil.com',
  'javascript:alert(1)', '/dashboard/staff', '/apply', '/dashboard/sanction/abc?tab=1', '/login', '',
  '/.//evil.com', '/..//evil.com', '/x/..//evil.com', '/apply/..//evil.com', '/%2e//evil.com', '/%2E%2E//evil.com',
  '/./evil.com', '/apply/../dashboard/staff'];
console.log('\nnext value → getSafeNextPath(next, role) → where router.replace() would go from https://lms.example/login');
for (const role of ['BORROWER', 'SANCTION', 'ADMIN'] as Role[]) {
  for (const next of nexts) {
    const safe = getSafeNextPath(next, role);
    const target = new URL(safe, 'https://lms.example/login');
    const offSite = target.origin !== 'https://lms.example';
    console.log(`${offSite ? 'OPEN-REDIRECT' : 'ok           '} ${role.padEnd(9)} ${JSON.stringify(next).padEnd(34)} → ${JSON.stringify(safe).padEnd(30)} → ${target.href}`);
  }
}
