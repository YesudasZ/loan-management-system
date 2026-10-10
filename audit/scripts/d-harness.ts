// Shared in-process harness for the Lens D scripts: in-memory replica set + createApp().
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { AUTH_COOKIE_NAME } from '../src/config/constants.js';
import { startTestDatabase, stopTestDatabase, clearTestDatabase } from '../tests/helpers/test-database.js';

export { request, clearTestDatabase };
export const ORIGIN = 'http://localhost:3000';

export async function start(): Promise<Express> {
  await startTestDatabase();
  return createApp();
}
export async function stop(): Promise<void> {
  await stopTestDatabase();
}

let failures = 0;
export function check(name: string, condition: boolean, detail: unknown = ''): void {
  if (!condition) failures += 1;
  const extra = condition ? '' : ` :: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
  process.stdout.write(`${condition ? 'PASS' : 'FAIL'} ${name}${extra}\n`);
}
export function note(text: string): void {
  process.stdout.write(`  · ${text}\n`);
}
export function summary(): number {
  process.stdout.write(`\nfailures=${failures}\n`);
  return failures;
}

export function cookieFrom(response: request.Response): string {
  const lines = (response.get('Set-Cookie') ?? []) as string[];
  const line = lines.find((l) => l.startsWith(`${AUTH_COOKIE_NAME}=`));
  if (!line) throw new Error(`no auth cookie (status ${response.status})`);
  return line.split(';')[0] ?? '';
}

export async function signup(app: Express, email: string, password = 'Audit@12345'): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/signup')
    .set('Origin', ORIGIN)
    .send({ name: 'Audit User', email, password });
  if (res.status !== 201) throw new Error(`signup ${res.status} ${JSON.stringify(res.body)}`);
  return cookieFrom(res);
}
export async function login(app: Express, email: string, password: string): Promise<request.Response> {
  return request(app).post('/api/v1/auth/login').set('Origin', ORIGIN).send({ email, password });
}

export function get(app: Express, path: string, cookie: string) {
  return request(app).get(`/api/v1${path}`).set('Cookie', cookie);
}
export function post(app: Express, path: string, cookie: string, body: object = {}) {
  return request(app).post(`/api/v1${path}`).set('Cookie', cookie).set('Origin', ORIGIN).send(body);
}
export function put(app: Express, path: string, cookie: string, body: object) {
  return request(app).put(`/api/v1${path}`).set('Cookie', cookie).set('Origin', ORIGIN).send(body);
}
export const SMALL_PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << >>\n%%EOF\n');
export function uploadPdf(app: Express, cookie: string) {
  return request(app)
    .post('/api/v1/borrower/salary-slip')
    .set('Cookie', cookie)
    .set('Origin', ORIGIN)
    .attach('file', SMALL_PDF, { filename: 'slip.pdf', contentType: 'application/pdf' });
}
