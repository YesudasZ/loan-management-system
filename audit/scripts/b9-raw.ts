// Lens B evidence script. To re-run: copy it and b-harness.ts into backend/audit-tmp-b/ (imports are relative to that folder), then from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-b/<file>.ts
// B9 raw: exact bytes over a local ephemeral port (127.0.0.1, same process) for encodings/charsets.
import { gzipSync } from 'node:zlib';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { setup } from './b-harness.js';
import { stopTestDatabase } from '../tests/helpers/test-database.js';

const app = await setup();
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
const { port } = server.address() as AddressInfo;
function send(path: string, headers: Record<string, string>, body: Buffer, method = 'POST'): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers: { ...headers, 'Content-Length': String(body.length) } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(`${res.statusCode} ${Buffer.concat(chunks).toString('utf8')}`));
    });
    req.on('error', reject);
    req.end(body);
  });
}
const login = Buffer.from(JSON.stringify({ email: 'nobody@test.dev', password: 'Password@123' }));
const json = { 'Content-Type': 'application/json' };
console.log('identity JSON          →', await send('/api/v1/auth/login', json, login));
console.log('valid gzip             →', await send('/api/v1/auth/login', { ...json, 'Content-Encoding': 'gzip' }, gzipSync(login)));
console.log('gzip header, plain body→', await send('/api/v1/auth/login', { ...json, 'Content-Encoding': 'gzip' }, login));
console.log('Content-Encoding: x-unknown →', await send('/api/v1/auth/login', { ...json, 'Content-Encoding': 'x-unknown' }, login));
console.log('charset=latin1         →', await send('/api/v1/auth/login', { 'Content-Type': 'application/json; charset=latin1' }, login));
console.log('path %E0%A4%A (anon)   →', await send('/api/v1/loans/%E0%A4%A', {}, Buffer.alloc(0), 'GET'));
console.log('path %E0%A4%A approve  →', await send('/api/v1/loans/%E0%A4%A/approve', json, Buffer.from('{}')));
console.log('path %ZZ admin user    →', await send('/api/v1/admin/users/%ZZ/role', json, Buffer.from('{"role":"SALES"}'), 'PATCH'));
server.close();
await stopTestDatabase();
process.exit(0);
