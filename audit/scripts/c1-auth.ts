// Lens C evidence copy. The relative imports expect backend/<any-folder>/: to re-run, copy this file and c-harness.ts
// into e.g. backend/audit-tmp-c/ and run from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused
// JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-c/c1-auth.ts
// C1: bcrypt cost, JWT alg pinning + expiry, cookie flags, logout.
import { SignJWT, decodeProtectedHeader, decodeJwt } from 'jose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { BCRYPT_COST } from '../src/config/constants.js';
import { env, isProduction } from '../src/config/env.js';
import { UserModel } from '../src/models/user.model.js';
import { check, note, startTestDatabase, stopTestDatabase, summary } from './c-harness.js';

const key = new TextEncoder().encode(env.JWT_SECRET);
const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

async function main() {
  await startTestDatabase();
  const app = createApp();
  note('NODE_ENV', `${env.NODE_ENV} isProduction=${isProduction}`);

  const signup = await request(app)
    .post('/api/v1/auth/signup')
    .send({ name: 'Cee One', email: 'c1@audit.dev', password: 'Test@1234' });
  check('signup 201', signup.status === 201, signup.status);
  const stored = await UserModel.findOne({ email: 'c1@audit.dev' }).select('+passwordHash');
  const prefix = stored?.passwordHash.slice(0, 7) ?? '';
  check('bcrypt constant >= 10', BCRYPT_COST >= 10, `BCRYPT_COST=${BCRYPT_COST}`);
  check('stored hash prefix $2b$10$', prefix === '$2b$10$', prefix);
  check('signup response has no hash', !JSON.stringify(signup.body).includes('$2b$'), '');

  const setCookie = (signup.get('Set-Cookie') ?? []).find((l) => l.startsWith('lms_token='));
  note('signup Set-Cookie (token elided)', setCookie?.replace(/lms_token=[^;]+/, 'lms_token=<jwt>'));
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'c1@audit.dev', password: 'Test@1234' });
  const loginCookie = (login.get('Set-Cookie') ?? []).find((l) => l.startsWith('lms_token=')) ?? '';
  const attrs = loginCookie.replace(/lms_token=[^;]+/, 'lms_token=<jwt>');
  note('login Set-Cookie (token elided)', attrs);
  check('cookie HttpOnly', /;\s*HttpOnly/i.test(loginCookie), '');
  check('cookie SameSite=Lax', /;\s*SameSite=Lax/i.test(loginCookie), '');
  check('cookie Path=/', /;\s*Path=\//i.test(loginCookie), '');
  check('cookie no Domain', !/;\s*Domain=/i.test(loginCookie), '');
  check('cookie Max-Age=86400', /Max-Age=86400/i.test(loginCookie), '');
  check(
    `cookie Secure === isProduction (${isProduction})`,
    /;\s*Secure/i.test(loginCookie) === isProduction,
    '',
  );

  const token = /lms_token=([^;]+)/.exec(loginCookie)?.[1] ?? '';
  const header = decodeProtectedHeader(token);
  const claims = decodeJwt(token);
  check('JWT alg HS256', header.alg === 'HS256', header);
  check('JWT exp - iat = 86400', (claims.exp ?? 0) - (claims.iat ?? 0) === 86400, {
    iat: claims.iat,
    exp: claims.exp,
  });
  note('JWT claims keys', Object.keys(claims));

  const me = (cookieToken: string) =>
    request(app).get('/api/v1/auth/me').set('Cookie', `lms_token=${cookieToken}`);

  check('valid token -> 200', (await me(token)).status === 200, '');

  const sub = String(claims.sub);
  const expired = await new SignJWT({ role: 'BORROWER' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(key);
  const expiredRes = await me(expired);
  check('expired token -> 401', expiredRes.status === 401, expiredRes.status);
  check(
    'expired token response clears cookie',
    (expiredRes.get('Set-Cookie') ?? []).some((l) => /lms_token=;/.test(l) && /Expires=Thu, 01 Jan 1970/.test(l)),
    expiredRes.get('Set-Cookie'),
  );

  const hs512 = await new SignJWT({ role: 'ADMIN' })
    .setProtectedHeader({ alg: 'HS512' })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
  check('HS512 token (same secret) -> 401', (await me(hs512)).status === 401, '');

  const none = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ sub, role: 'ADMIN', exp: Math.floor(Date.now() / 1000) + 3600 })}.`;
  check('alg=none token -> 401', (await me(none)).status === 401, '');

  const wrongSecret = await new SignJWT({ role: 'BORROWER' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode('another-secret-another-secret-123456'));
  check('wrong-secret token -> 401', (await me(wrongSecret)).status === 401, '');

  const noExp = await new SignJWT({ role: 'BORROWER' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt()
    .sign(key);
  const noExpRes = await me(noExp);
  note('token WITHOUT exp signed with the real secret', `status=${noExpRes.status} (jwtVerify has no requiredClaims)`);

  const tampered = token.split('.');
  tampered[1] = b64url({ ...claims, role: 'ADMIN' });
  check('payload-tampered token -> 401', (await me(tampered.join('.'))).status === 401, '');

  const logout = await request(app)
    .post('/api/v1/auth/logout')
    .set('Cookie', `lms_token=${token}`)
    .set('Origin', 'http://localhost:3000');
  const logoutCookie = (logout.get('Set-Cookie') ?? []).find((l) => l.startsWith('lms_token=')) ?? '';
  note('logout Set-Cookie', logoutCookie);
  check('logout 200', logout.status === 200, logout.status);
  check('logout clears cookie (empty + epoch)', /^lms_token=;/.test(logoutCookie) && /Expires=Thu, 01 Jan 1970/.test(logoutCookie), '');
  check('logout cookie keeps HttpOnly/SameSite/Path', /HttpOnly/.test(logoutCookie) && /SameSite=Lax/.test(logoutCookie) && /Path=\//.test(logoutCookie), '');
  check(`logout cookie Secure === isProduction`, /;\s*Secure/i.test(logoutCookie) === isProduction, '');
  const afterLogout = await me(token);
  note('old JWT replayed after logout (stateless, no revocation)', `status=${afterLogout.status}`);

  await stopTestDatabase();
  summary();
}

main().catch(async (error: unknown) => {
  process.stdout.write(`ERROR ${String(error)}\n${(error as Error).stack ?? ''}\n`);
  await stopTestDatabase();
  process.exit(1);
});
