// Lens B evidence script. To re-run: copy it and b-harness.ts into backend/audit-tmp-b/ (imports are relative to that folder), then from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-b/<file>.ts
// Lens B audit harness: in-process app + in-memory replica set + a request recorder.
import { writeFileSync } from 'node:fs';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createTestUser, type TestUser } from '../tests/helpers/auth.js';
import { startTestDatabase, stopTestDatabase } from '../tests/helpers/test-database.js';

export interface Recorded {
  label: string;
  identity: string;
  method: string;
  path: string;
  status: number;
  contentType: string;
  text: string;
  json: unknown;
}

export const log: Recorded[] = [];

export interface CallOptions {
  label: string;
  identity: string;
  cookie?: string;
  body?: object;
  attach?: { buffer: Buffer; filename: string; contentType: string };
  headers?: Record<string, string>;
  rawBody?: { data: string; contentType: string };
}

export async function call(
  app: Express,
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
  options: CallOptions,
): Promise<Recorded> {
  let req = request(app)[method](path);
  if (options.cookie) req = req.set('Cookie', options.cookie);
  for (const [key, value] of Object.entries(options.headers ?? {})) req = req.set(key, value);
  req = req.buffer(true).parse((res, callback) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  });
  let response;
  if (options.attach) {
    response = await req.attach('file', options.attach.buffer, {
      filename: options.attach.filename,
      contentType: options.attach.contentType,
    });
  } else if (options.rawBody) {
    response = await req.set('Content-Type', options.rawBody.contentType).send(options.rawBody.data);
  } else if (options.body !== undefined) {
    response = await req.send(options.body);
  } else {
    response = await req;
  }
  const buffer = Buffer.isBuffer(response.body) ? response.body : Buffer.alloc(0);
  const contentType = String(response.headers['content-type'] ?? '');
  const text = contentType.includes('json') || contentType.startsWith('text')
    ? buffer.toString('utf8')
    : buffer.toString('latin1');
  let json: unknown = null;
  if (contentType.includes('json')) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  const recorded: Recorded = {
    label: options.label,
    identity: options.identity,
    method: method.toUpperCase(),
    path,
    status: response.status,
    contentType,
    text,
    json,
  };
  log.push(recorded);
  return recorded;
}

export async function setup(): Promise<Express> {
  await startTestDatabase();
  const big = { windowMs: 60_000, limit: 100_000 };
  return createApp({ authRateLimits: { login: big, signup: big, session: big } });
}

export async function teardown(outFile: string): Promise<void> {
  writeFileSync(outFile, JSON.stringify(log, null, 1));
  await stopTestDatabase();
}

export { createTestUser, type TestUser };

/** Every bcrypt-looking hash or passwordHash key in any recorded response. */
export function scanForHashes(entries: Recorded[]): Recorded[] {
  return entries.filter(
    (entry) => /passwordHash/i.test(entry.text) || /\$2[aby]\$\d\d\$/.test(entry.text),
  );
}

/** Error responses that don't match { success: false, error: { code, message, details? } }. */
export function badEnvelopes(entries: Recorded[]): Recorded[] {
  return entries.filter((entry) => {
    if (entry.status < 400) return false;
    const body = entry.json as Record<string, unknown> | null;
    if (!body || body.success !== false) return true;
    const error = body.error as Record<string, unknown> | undefined;
    if (!error || typeof error.code !== 'string' || typeof error.message !== 'string') return true;
    const allowedKeys = new Set(['code', 'message', 'details']);
    if (Object.keys(error).some((key) => !allowedKeys.has(key))) return true;
    if (Object.keys(body).some((key) => key !== 'success' && key !== 'error')) return true;
    return false;
  });
}
