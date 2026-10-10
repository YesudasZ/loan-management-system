// Lens C evidence copy. The relative imports expect backend/<any-folder>/: to re-run, copy this file and c-harness.ts
// into e.g. backend/audit-tmp-c/ and run from backend/: NODE_ENV=production MONGODB_URI=mongodb://127.0.0.1:27017/unused
// JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=info npx tsx audit-tmp-c/c12-logs.ts
// C12: what the request logger and error logs contain. Run with LOG_LEVEL=info and capture stdout;
// lines starting with "AUDIT|" are this script's markers, every other line is a pino log entry.
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createStaff } from '../tests/helpers/loans.js';
import { ORIGIN, startTestDatabase, stopTestDatabase } from './c-harness.js';

const marker = (text: string) => process.stdout.write(`AUDIT|${text}\n`);

async function main() {
  await startTestDatabase();
  const app = createApp();
  const staff = await createStaff();

  const signup = await request(app).post('/api/v1/auth/signup').set('Origin', ORIGIN)
    .send({ name: 'Log Probe', email: 'log-probe@audit.dev', password: 'Test@1234' });
  marker(`signup ${signup.status}`);
  const login = await request(app).post('/api/v1/auth/login').set('Origin', ORIGIN).set('X-Forwarded-For', '198.51.100.7')
    .send({ email: 'log-probe@audit.dev', password: 'Test@1234' });
  const setCookie = (login.headers['set-cookie'] as unknown as string[] | undefined)?.[0] ?? '';
  const token = setCookie.split(';')[0].split('=')[1] ?? '';
  marker(`login ${login.status} TOKEN=${token}`);
  const cookie = `lms_token=${token}`;
  const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookie).set('Authorization', `Bearer ${token}`);
  marker(`me ${me.status}`);
  const profile = await request(app).put('/api/v1/borrower/profile').set('Origin', ORIGIN).set('Cookie', cookie)
    .send({ fullName: 'Log Probe', pan: 'ZQXWV9876K', dateOfBirth: '1995-06-15', monthlySalary: 5_000_000, employmentMode: 'SALARIED' });
  marker(`profile ${profile.status}`);
  const getProfile = await request(app).get('/api/v1/borrower/profile').set('Cookie', cookie);
  marker(`get profile ${getProfile.status} pan-in-response=${JSON.stringify(getProfile.body).includes('ZQXWV9876K')}`);
  const badLogin = await request(app).post('/api/v1/auth/login').set('Origin', ORIGIN).send({ email: 'log-probe@audit.dev', password: 'WrongPass@999' });
  marker(`bad login ${badLogin.status}`);
  const badJson = await request(app).post('/api/v1/auth/login').set('Origin', ORIGIN).set('Content-Type', 'application/json')
    .send('{"email":"log-probe@audit.dev","password":"JsonPass@777",');
  marker(`bad json ${badJson.status}`);
  const encoded = await request(app).post('/api/v1/auth/login').set('Origin', ORIGIN).set('Content-Type', 'application/json')
    .set('Content-Encoding', 'compress').send('{"email":"log-probe@audit.dev","password":"EncPass@555"}');
  marker(`compress 500 ${encoded.status}`);
  const nul = await request(app).get('/api/v1/admin/users?search=a%00b').set('Cookie', staff.ADMIN.cookie);
  marker(`nul search ${nul.status}`);
  const pwChange = await request(app).post('/api/v1/admin/users').set('Origin', ORIGIN).set('Cookie', staff.ADMIN.cookie)
    .send({ name: 'Staff Probe', email: 'staff-probe@audit.dev', password: 'StaffPass@321', role: 'SALES' });
  marker(`admin create ${pwChange.status}`);
  const logout = await request(app).post('/api/v1/auth/logout').set('Origin', ORIGIN).set('Cookie', cookie);
  marker(`logout ${logout.status}`);

  await stopTestDatabase();
}

main().catch(async (error) => {
  marker(`CRASH ${String(error?.stack ?? error)}`);
  await stopTestDatabase();
  process.exit(1);
});
