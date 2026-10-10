// Lens C evidence copy. The relative imports expect backend/<any-folder>/: to re-run, copy this file and c-harness.ts
// into e.g. backend/audit-tmp-c/ and run from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused
// JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-c/c6-redos.ts
// C6: regex injection / ReDoS in GET /api/v1/admin/users?search=
import request from 'supertest';
import { createApp } from '../src/app.js';
import { UserModel } from '../src/models/user.model.js';
import { createStaff } from '../tests/helpers/loans.js';
import { check, note, startTestDatabase, stopTestDatabase, summary } from './c-harness.js';

async function main() {
  await startTestDatabase();
  const app = createApp();
  const staff = await createStaff();
  // Users whose names would make a vulnerable regex backtrack, plus literal special characters.
  const docs = [];
  for (let i = 0; i < 300; i += 1) {
    docs.push({ name: `${'a'.repeat(60)}!${i}`, email: `${'a'.repeat(40)}${i}@audit.dev`, passwordHash: 'x', role: 'BORROWER' });
  }
  docs.push({ name: 'Dot a.b (Paren) [Br] $x^ |pipe| back\\slash', email: 'special@audit.dev', passwordHash: 'x', role: 'BORROWER' });
  docs.push({ name: 'Plain axb', email: 'axb@audit.dev', passwordHash: 'x', role: 'BORROWER' });
  docs.push({ name: 'Ünïcödé Ñame', email: 'unicode@audit.dev', passwordHash: 'x', role: 'BORROWER' });
  await UserModel.insertMany(docs);

  const search = async (term: string) => {
    const start = performance.now();
    const res = await request(app).get('/api/v1/admin/users').query({ search: term, limit: 100 }).set('Cookie', staff.ADMIN.cookie);
    return { res, ms: Math.round(performance.now() - start) };
  };

  const baseline = await search('plain');
  note('baseline search ms', baseline.ms);

  const evil = ['(a+)+$', '(a|aa)+$', '(a*)*b', '^(([a-z])+.)+[A-Z]([a-z])+$', '(.*a){20}', '(?:a+){10}$'];
  for (const pattern of evil) {
    const term = pattern.repeat(Math.floor(100 / pattern.length)).slice(0, 100);
    const { res, ms } = await search(term);
    check(`catastrophic "${pattern}" x${Math.floor(100 / pattern.length)} (len ${term.length}) -> 200 fast, 0 hits`, res.status === 200 && ms < 1000 && res.body.data.pagination.totalItems === 0, `${res.status} ${ms} ms hits=${res.body?.data?.pagination?.totalItems}`);
  }
  const longA = await search(`${'a'.repeat(99)}!`);
  check('100-char literal over 300 long names -> 200 fast', longA.res.status === 200 && longA.ms < 1000, `${longA.res.status} ${longA.ms} ms hits=${longA.res.body?.data?.pagination?.totalItems}`);

  const over = await search('a'.repeat(101));
  check('101 chars -> 400', over.res.status === 400, over.res.status);
  const padded = await search(`${' '.repeat(500)}axb${' '.repeat(500)}`);
  note('1000 spaces + "axb" (trimmed before the max check)', `${padded.res.status} hits=${padded.res.body?.data?.pagination?.totalItems}`);

  const literalCases: [string, number][] = [
    ['a.b', 1], ['(Paren)', 1], ['[Br]', 1], ['$x^', 1], ['|pipe|', 1], ['back\\slash', 1], ['.', 1], ['*', 0], ['\\', 1], ['?', 0], ['Ünïcödé', 1], ['ñame', 1], ['a\u0000b', 0], ['%', 0],
  ];
  for (const [term, expected] of literalCases) {
    const { res } = await search(term);
    check(`literal "${JSON.stringify(term)}" -> ${expected} hit(s)`, res.status === 200 && res.body.data.pagination.totalItems === expected, `${res.status} hits=${res.body?.data?.pagination?.totalItems}`);
  }
  const unbalanced = await search('((((');
  check('unbalanced "((((" -> 200 (no regex compile error / 500)', unbalanced.res.status === 200, unbalanced.res.status);

  await stopTestDatabase();
  summary();
}

main().catch(async (error: unknown) => {
  process.stdout.write(`ERROR ${String(error)}\n${(error as Error).stack ?? ''}\n`);
  await stopTestDatabase();
  process.exit(1);
});
