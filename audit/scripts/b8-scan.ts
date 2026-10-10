// Lens B evidence script. To re-run: copy it and b-harness.ts into backend/audit-tmp-b/ (imports are relative to that folder), then from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-b/<file>.ts
// B8: scan every response recorded by the lens B scripts for a passwordHash key or a bcrypt hash.
import { readFileSync, existsSync } from 'node:fs';
import { scanForHashes, type Recorded } from './b-harness.js';

const DIR = process.argv[2] ?? '.';
let total = 0;
const routes = new Set<string>();
for (const name of ['b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b9']) {
  const file = `${DIR}/${name}.json`;
  if (!existsSync(file)) { console.log(`${name}: (missing)`); continue; }
  const entries = JSON.parse(readFileSync(file, 'utf8')) as Recorded[];
  total += entries.length;
  for (const e of entries) routes.add(`${e.method} ${e.path.replace(/[a-fA-F\d]{24}/g, ':id').replace(/\?.*$/, '')}`);
  const hits = scanForHashes(entries);
  console.log(`${name}: ${entries.length} responses, ${hits.length} with passwordHash / $2b$`);
  for (const h of hits) console.log('   HIT', h.identity, h.method, h.path, h.status, h.text.slice(0, 200));
}
console.log(`total ${total} responses, ${routes.size} distinct method+path shapes`);
console.log([...routes].sort().join('\n'));
