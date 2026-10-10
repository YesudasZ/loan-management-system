// Lens B evidence script. To re-run: copy it and b-harness.ts into backend/audit-tmp-b/ (imports are relative to that folder), then from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-b/<file>.ts
// B9 extra: the raw error objects behind the 500s, a correct gzip body, and the DB-down cookie.
import { gzipSync } from 'node:zlib';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { setup, createTestUser } from './b-harness.js';
import { stopTestDatabase } from '../tests/helpers/test-database.js';

const app = await setup();
const admin = await createTestUser('ADMIN', 'admin.extra@test.dev');
const gz = gzipSync(Buffer.from(JSON.stringify({ email: 'nobody@test.dev', password: 'Password@123' })));
const r1 = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').set('Content-Encoding', 'gzip').send(gz);
console.log('valid gzip login →', r1.status, JSON.stringify(r1.body));
const r1b = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').set('Content-Encoding', 'deflate').send(Buffer.from('not deflate'));
console.log('bad deflate →', r1b.status, JSON.stringify(r1b.body));
const r1c = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json; charset=utf-7').send(Buffer.from('{"email":"a@b.co","password":"x"}'));
console.log('charset=utf-7 (Buffer) →', r1c.status, JSON.stringify(r1c.body));

// What the error handler receives: replay through a probe app with the same parsers.
const probe = express();
probe.use(express.json({ limit: '100kb' }));
probe.get('/x/:id', (_req, res) => { res.json({ ok: true }); });
probe.post('/x', (_req, res) => { res.json({ ok: true }); });
probe.use((err: { status?: number; statusCode?: number; type?: string; message?: string; expose?: boolean }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(299).json({ status: err.status, statusCode: err.statusCode, type: err.type, expose: err.expose, message: err.message });
});
for (const [label, req] of [
  ['path %E0%A4%A', request(probe).get('/x/%E0%A4%A')],
  ['Content-Encoding x-unknown', request(probe).post('/x').set('Content-Type', 'application/json').set('Content-Encoding', 'x-unknown').send('{}')],
  ['gzip plain bytes', request(probe).post('/x').set('Content-Type', 'application/json').set('Content-Encoding', 'gzip').send('{}')],
  ['charset utf-7', request(probe).post('/x').set('Content-Type', 'application/json; charset=utf-7').send(Buffer.from('{}'))],
] as const) {
  const r = await req;
  console.log(`probe ${label}: ${JSON.stringify(r.body)}`);
}

// Database down: does /auth/me clear the session cookie?
await mongoose.disconnect();
const t0 = Date.now();
const r2 = await request(app).get('/api/v1/auth/me').set('Cookie', admin.cookie);
console.log('DB down /auth/me →', r2.status, `${Date.now() - t0} ms`, JSON.stringify(r2.body), 'Set-Cookie:', JSON.stringify(r2.headers['set-cookie']));
const r3 = await request(app).get('/api/v1/loans').set('Cookie', admin.cookie);
console.log('DB down /loans →', r3.status, JSON.stringify(r3.body), 'Set-Cookie:', JSON.stringify(r3.headers['set-cookie']));
await stopTestDatabase().catch(() => undefined);
process.exit(0);
