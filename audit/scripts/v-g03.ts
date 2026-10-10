// P1 verifier evidence copy. To re-run: mkdir backend/audit-tmp-v && cp audit/scripts/v-*.ts backend/audit-tmp-v/ && cp audit/scripts/d-harness.ts backend/audit-tmp-v/harness.ts, then from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-v/<file>.ts
// P1 verifier: G-03/G-04 consistency. Code path: demo seed resets roles; admin can make a loan-less
// demo borrower staff; counts produced by the current (branch-5+) demo seed.
import { start, stop, login, cookieFrom, get, check, note, summary, request, ORIGIN } from './harness.js';
import { seedDemoData } from '../src/scripts/seed-demo.js';
import { UserModel } from '../src/models/user.model.js';
import { LoanModel } from '../src/models/loan.model.js';

const app = await start();
const r1 = await seedDemoData();
note(`seedDemoData → ${JSON.stringify(r1)}; users=${await UserModel.countDocuments()} loans=${await LoanModel.countDocuments()}`);
const byStatus = await LoanModel.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
note(`loans by status (current seed): ${JSON.stringify(byStatus)}`);
const admin = cookieFrom(await login(app, 'admin@lms.dev', 'Password@123'));
const adminLoans = await get(app, '/loans', admin);
note(`admin GET /loans totalItems=${adminLoans.body?.data?.pagination?.totalItems ?? JSON.stringify(adminLoans.body).slice(0, 200)}`);
const usersRes = await get(app, '/admin/users', admin);
note(`admin GET /admin/users totalItems=${usersRes.body?.data?.pagination?.totalItems}`);
const closed = await login(app, 'demo.closed@lms.dev', 'Password@123');
check('current seed creates demo.closed (login 200)', closed.status === 200, closed.status);

const borrower = await UserModel.findOne({ email: 'borrower@lms.dev' });
const patch = await request(app)
  .patch(`/api/v1/admin/users/${borrower?._id.toString()}/role`)
  .set('Cookie', admin).set('Origin', ORIGIN).send({ role: 'COLLECTION' });
check('admin PATCH borrower@lms.dev (no loans) → COLLECTION is 200', patch.status === 200, patch.body);
const b = cookieFrom(await login(app, 'borrower@lms.dev', 'Password@123'));
const prog = await get(app, '/borrower/progress', b);
const myLoans = await get(app, '/borrower/loans', b);
const staffLoans = await get(app, '/loans', b);
check('as COLLECTION: /borrower/progress 403, /borrower/loans 403, /loans 200 (matches live G-03)',
  prog.status === 403 && myLoans.status === 403 && staffLoans.status === 200, [prog.status, myLoans.status, staffLoans.status]);
const withLoan = await UserModel.findOne({ email: 'demo.applied1@lms.dev' });
const patch2 = await request(app)
  .patch(`/api/v1/admin/users/${withLoan?._id.toString()}/role`)
  .set('Cookie', admin).set('Origin', ORIGIN).send({ role: 'COLLECTION' });
check('a borrower WITH a loan cannot be made staff (409 BORROWER_HAS_LOANS)', patch2.status === 409 && patch2.body?.error?.code === 'BORROWER_HAS_LOANS', patch2.body);
await seedDemoData();
const after = await UserModel.findOne({ email: 'borrower@lms.dev' });
check('re-running seedDemoData resets borrower@lms.dev to BORROWER', after?.role === 'BORROWER', after?.role);
summary();
await stop();
