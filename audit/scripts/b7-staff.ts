// Lens B evidence script. To re-run: copy it and b-harness.ts into backend/audit-tmp-b/ (imports are relative to that folder), then from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-b/<file>.ts
// B7: staff management rules (/api/v1/admin/users) and sign-up never creating staff.
import { call, createTestUser, setup, teardown, type Recorded } from './b-harness.js';
import { createAppliedLoan, createDisbursedLoan, createStaff } from '../tests/helpers/loans.js';
import { UserModel } from '../src/models/user.model.js';
import { toBusinessDate } from '../src/utils/dates.js';

const OUT = '/private/tmp/claude-501/-Users-yesudasmj-Loan-Management-System/ddaf42ca-a25f-4641-9209-365d0e8586f0/scratchpad';
const app = await setup();
const staff = await createStaff();
const results: { label: string; exp: number | string; got: number | string; note: string }[] = [];
const err = (r: Recorded) => (r.json as { error?: { code: string } } | null)?.error?.code ?? '';
const rec = (label: string, exp: number, r: Recorded, expCode = '') =>
  results.push({ label, exp: `${exp} ${expCode}`.trim(), got: `${r.status} ${expCode ? err(r) : ''}`.trim(), note: expCode ? '' : err(r) });
const fact = (label: string, ok: boolean, note = '') => results.push({ label, exp: 'true', got: String(ok), note });
const admin = staff.ADMIN;
const patchRole = (cookie: string, userId: string, role: string, label = 'patch') =>
  call(app, 'patch', `/api/v1/admin/users/${userId}/role`, { label, identity: 'ADMIN', cookie, body: { role } });
const roleOf = async (id: string) => (await UserModel.findById(id))?.role;

// 1. Only ADMIN.
for (const role of ['SALES', 'SANCTION', 'DISBURSEMENT', 'COLLECTION'] as const) {
  rec(`${role} GET /admin/users`, 403, await call(app, 'get', '/api/v1/admin/users', { label: 'list', identity: role, cookie: staff[role].cookie }));
  rec(`${role} POST /admin/users`, 403, await call(app, 'post', '/api/v1/admin/users', { label: 'create', identity: role, cookie: staff[role].cookie, body: { name: 'X Y', email: `x.${role}@test.dev`, password: 'Test@1234', role: 'ADMIN' } }));
  rec(`${role} PATCH own role → ADMIN`, 403, await patchRole(staff[role].cookie, staff[role].id, 'ADMIN'));
}

// 2. Admin can't change their own role (lower-case id as issued, then upper-case hex).
rec('ADMIN PATCH own role (own id as issued)', 409, await patchRole(admin.cookie, admin.id, 'SALES'), 'CANNOT_CHANGE_OWN_ROLE');
const upperSelfOnlyAdmin = await patchRole(admin.cookie, admin.id.toUpperCase(), 'SALES');
rec('ADMIN PATCH own role, id in UPPER-case hex, only admin', 409, upperSelfOnlyAdmin, 'CANNOT_CHANGE_OWN_ROLE');
fact('… admin is still ADMIN', (await roleOf(admin.id)) === 'ADMIN');

// 3. With a second admin, the upper-case self-change is not caught by CANNOT_CHANGE_OWN_ROLE.
const create2 = await call(app, 'post', '/api/v1/admin/users', { label: 'create admin2', identity: 'ADMIN', cookie: admin.cookie, body: { name: 'Second Admin', email: 'admin2@test.dev', password: 'Test@1234', role: 'ADMIN' } });
rec('ADMIN creates a second ADMIN', 201, create2);
const admin2Id = (create2.json as { data: { user: { id: string } } }).data.user.id;
const login2 = await call(app, 'post', '/api/v1/auth/login', { label: 'admin2 login', identity: 'ANON', body: { email: 'admin2@test.dev', password: 'Test@1234' } });
rec('second admin logs in with the admin-set password', 200, login2);
const admin2Cookie = String((login2 as unknown as { text: string }) && '') || '';
void admin2Cookie;
const selfUpper2 = await patchRole(admin.cookie, admin.id.toUpperCase(), 'SALES', 'self upper with 2 admins');
rec('ADMIN PATCH own role, id in UPPER-case hex, 2 admins exist', 409, selfUpper2, 'CANNOT_CHANGE_OWN_ROLE');
fact('… admin is still ADMIN after the upper-case self-change', (await roleOf(admin.id)) === 'ADMIN', `now ${await roleOf(admin.id)}; response ${selfUpper2.text.slice(0, 160)}`);
// restore if the bypass worked, so later steps run with the original admin
if ((await roleOf(admin.id)) !== 'ADMIN') await UserModel.updateOne({ _id: admin.id }, { $set: { role: 'ADMIN' } });

// 4. Last admin: demote admin2 (fine), then nobody can demote the remaining one.
rec('ADMIN demotes the second admin to SALES', 200, await patchRole(admin.cookie, admin2Id, 'SALES'));
// Mutual concurrent demotion of two admins: at least one admin must remain.
const third = await createTestUser('ADMIN', 'admin3@test.dev');
const [d1, d2] = await Promise.all([patchRole(admin.cookie, third.id, 'SALES', 'race1'), patchRole(third.cookie, admin.id, 'SALES', 'race2')]);
const adminsLeft = await UserModel.countDocuments({ role: 'ADMIN' });
fact(`concurrent mutual demotion (${d1.status} ${err(d1)} / ${d2.status} ${err(d2)}) leaves ≥ 1 admin`, adminsLeft >= 1, `${adminsLeft} admin(s) left`);
const remainingAdmin = (await roleOf(admin.id)) === 'ADMIN' ? admin : third;
// Seed-level check of the LAST_ADMIN guard itself (only reachable via a second admin account
// whose session is stale): demote the remaining admin from a session belonging to a user who
// is no longer admin → 403 (role read from the DB on every request).
const exAdmin = remainingAdmin === admin ? third : admin;
rec('a demoted admin\'s old session can no longer use /admin/users', 403, await call(app, 'get', '/api/v1/admin/users', { label: 'stale admin', identity: 'ex-ADMIN', cookie: exAdmin.cookie }));

// 5. Borrowers with any loan can't become staff.
const applied = await createAppliedLoan(app);
rec('borrower with APPLIED loan → SANCTION', 409, await patchRole(remainingAdmin.cookie, applied.borrower.id, 'SANCTION'), 'BORROWER_HAS_LOANS');
const rejected = await createAppliedLoan(app);
await call(app, 'post', `/api/v1/loans/${rejected.loanId}/reject`, { label: 'reject', identity: 'SANCTION', cookie: staff.SANCTION.cookie, body: { reason: 'Setup rejection' } });
rec('borrower with only a REJECTED loan → COLLECTION', 409, await patchRole(remainingAdmin.cookie, rejected.borrower.id, 'COLLECTION'), 'BORROWER_HAS_LOANS');
const closed = await createDisbursedLoan(app, staff);
await call(app, 'post', `/api/v1/loans/${closed.loanId}/payments`, { label: 'close', identity: 'COLLECTION', cookie: staff.COLLECTION.cookie, body: { utr: 'B7CLOSEUTR01', amount: closed.totalRepayment, paymentDate: toBusinessDate() } });
rec('borrower with only a CLOSED loan → ADMIN', 409, await patchRole(remainingAdmin.cookie, closed.borrower.id, 'ADMIN'), 'BORROWER_HAS_LOANS');
const clean = await createTestUser('BORROWER', 'clean.borrower@test.dev');
rec('borrower with no loans → SALES', 200, await patchRole(remainingAdmin.cookie, clean.id, 'SALES'));
rec('same role again (SALES → SALES) is a no-op 200', 200, await patchRole(remainingAdmin.cookie, clean.id, 'SALES'));

// 6. A role change applies on the very next request with the old cookie.
const sales = staff.SALES;
rec('SALES before: GET /leads', 200, await call(app, 'get', '/api/v1/leads', { label: 'leads', identity: 'SALES', cookie: sales.cookie }));
rec('ADMIN changes SALES → COLLECTION', 200, await patchRole(remainingAdmin.cookie, sales.id, 'COLLECTION'));
rec('old SALES cookie: GET /leads now', 403, await call(app, 'get', '/api/v1/leads', { label: 'leads', identity: 'SALES→COLLECTION', cookie: sales.cookie }));
rec('old SALES cookie: GET /loans now', 200, await call(app, 'get', '/api/v1/loans', { label: 'loans', identity: 'SALES→COLLECTION', cookie: sales.cookie }));
const me = await call(app, 'get', '/api/v1/auth/me', { label: 'me', identity: 'SALES→COLLECTION', cookie: sales.cookie });
fact('/auth/me reports the new role', (me.json as { data: { user: { role: string } } }).data.user.role === 'COLLECTION');

// 7. Public sign-up never creates staff.
for (const role of ['ADMIN', 'SANCTION', 'BORROWER']) {
  rec(`signup with role=${role} in body`, 400, await call(app, 'post', '/api/v1/auth/signup', { label: 'signup role', identity: 'ANON', body: { name: 'Sneaky', email: `sneaky.${role}@test.dev`, password: 'Test@1234', role } }), 'VALIDATION_ERROR');
}
rec('signup with roleHistory in body', 400, await call(app, 'post', '/api/v1/auth/signup', { label: 'signup rh', identity: 'ANON', body: { name: 'Sneaky', email: 'sneaky.rh@test.dev', password: 'Test@1234', roleHistory: [] } }));
fact('no "sneaky" user was created', (await UserModel.countDocuments({ email: /sneaky/ })) === 0);
const signup = await call(app, 'post', '/api/v1/auth/signup', { label: 'signup', identity: 'ANON', body: { name: 'Plain User', email: 'plain@test.dev', password: 'Test@1234' } });
fact('plain signup → 201 role BORROWER', signup.status === 201 && (signup.json as { data: { user: { role: string } } }).data.user.role === 'BORROWER');

// 8. POST /admin/users can't create a BORROWER or take extra fields.
const create = (body: object, label: string) => call(app, 'post', '/api/v1/admin/users', { label, identity: 'ADMIN', cookie: remainingAdmin.cookie, body });
rec('POST /admin/users role=BORROWER', 400, await create({ name: 'Bo Rower', email: 'bo@test.dev', password: 'Test@1234', role: 'BORROWER' }, 'borrower'), 'VALIDATION_ERROR');
rec('POST /admin/users without role', 400, await create({ name: 'No Role', email: 'norole@test.dev', password: 'Test@1234' }, 'norole'));
rec('POST /admin/users role=SUPERADMIN', 400, await create({ name: 'Super', email: 'super@test.dev', password: 'Test@1234', role: 'SUPERADMIN' }, 'super'));
rec('POST /admin/users with passwordHash field', 400, await create({ name: 'Hash', email: 'hash@test.dev', password: 'Test@1234', role: 'SALES', passwordHash: 'x' }, 'hash'));
rec('POST /admin/users weak password', 400, await create({ name: 'Weak', email: 'weak@test.dev', password: 'short', role: 'SALES' }, 'weak'));
rec('POST /admin/users email already used (upper-case variant)', 409, await create({ name: 'Dup', email: 'PLAIN@test.dev', password: 'Test@1234', role: 'SALES' }, 'dup'), 'EMAIL_ALREADY_REGISTERED');
rec('PATCH role=GOD', 400, await patchRole(remainingAdmin.cookie, clean.id, 'GOD'));
rec('PATCH malformed user id', 400, await patchRole(remainingAdmin.cookie, 'abc', 'SALES'));
rec('PATCH extra body field', 400, await call(app, 'patch', `/api/v1/admin/users/${clean.id}/role`, { label: 'extra', identity: 'ADMIN', cookie: remainingAdmin.cookie, body: { role: 'SALES', by: admin.id } }));
const list = await call(app, 'get', '/api/v1/admin/users?limit=100', { label: 'list', identity: 'ADMIN', cookie: remainingAdmin.cookie });
const keys = [...new Set((list.json as { data: { items: object[] } }).data.items.flatMap((u) => Object.keys(u)))].sort();
fact(`AdminUser keys = ${keys.join(',')}`, JSON.stringify(keys) === JSON.stringify(['createdAt', 'email', 'id', 'name', 'role']));

for (const r of results) console.log(`${String(r.exp) === String(r.got) ? 'PASS' : 'FAIL'}  ${r.label.padEnd(66)} exp ${r.exp} got ${r.got} ${r.note}`);
console.log(`\n${results.filter((r) => String(r.exp) === String(r.got)).length}/${results.length} passed`);
await teardown(`${OUT}/b7.json`);
