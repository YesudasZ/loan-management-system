// Lens C evidence copy. The relative imports expect backend/<any-folder>/: to re-run, copy this file and c-harness.ts
// into e.g. backend/audit-tmp-c/ and run from backend/: NODE_ENV=test MONGODB_URI=mongodb://127.0.0.1:27017/unused
// JWT_SECRET=audit-only-secret-0123456789abcdefghij CORS_ORIGINS=http://localhost:3000 TRUST_PROXY_HOPS=1 LOG_LEVEL=silent npx tsx audit-tmp-c/c9-uploads.ts
// C9: salary slip uploads (type checks, size, filenames, multipart shape) and downloads (auth, headers, IDOR).
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { MAX_UPLOAD_BYTES } from '../src/config/constants.js';
import { createTestUser, type TestUser } from '../tests/helpers/auth.js';
import { LOAN_REQUEST, SAMPLE_FILES, saveEligibleProfile } from '../tests/helpers/borrower.js';
import { createStaff } from '../tests/helpers/loans.js';
import { check, note, ORIGIN, startTestDatabase, stopTestDatabase, summary } from './c-harness.js';

const SLIP = '/api/v1/borrower/salary-slip';

interface Part { name: string; filename?: string; contentType?: string; data: Buffer | string }

function rawMultipart(parts: Part[], boundary = 'AUDITBOUNDARY123'): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"`;
    if (part.filename !== undefined) head += `; filename="${part.filename}"`;
    head += '\r\n';
    if (part.contentType) head += `Content-Type: ${part.contentType}\r\n`;
    head += '\r\n';
    chunks.push(Buffer.from(head, 'latin1'), Buffer.isBuffer(part.data) ? part.data : Buffer.from(part.data), Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

async function latestGridFsFile() {
  return mongoose.connection.db?.collection('salary_slips.files').find().sort({ uploadDate: -1 }).limit(1).next();
}

async function main() {
  await startTestDatabase();
  const app = createApp();
  const staff = await createStaff();
  const a = await createTestUser('BORROWER', 'slip-a@audit.dev');
  await saveEligibleProfile(app, a.cookie);
  const b = await createTestUser('BORROWER', 'slip-b@audit.dev');
  await saveEligibleProfile(app, b.cookie);

  const upload = (user: TestUser, data: Buffer, filename: string, contentType: string) =>
    request(app).post(SLIP).set('Origin', ORIGIN).set('Cookie', user.cookie).attach('file', data, { filename, contentType });
  const sendRaw = (user: TestUser, body: Buffer, contentType = 'multipart/form-data; boundary=AUDITBOUNDARY123') =>
    request(app).post(SLIP).set('Origin', ORIGIN).set('Cookie', user.cookie).set('Content-Type', contentType).send(body);

  // Spoofed types.
  const html = Buffer.from('<!DOCTYPE html><html><body><script>alert(document.cookie)</script></body></html>');
  const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script></svg>');
  const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)]);
  const gif = Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1');
  const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(100)]);
  const typeCases: [string, Buffer, string, string, number][] = [
    ['HTML renamed slip.pdf (application/pdf)', html, 'slip.pdf', 'application/pdf', 415],
    ['SVG renamed slip.png (image/png)', svg, 'slip.png', 'image/png', 415],
    ['SVG as slip.svg (image/svg+xml)', svg, 'slip.svg', 'image/svg+xml', 415],
    ['HTML as slip.html (text/html)', html, 'slip.html', 'text/html', 415],
    ['EXE renamed slip.pdf', exe, 'slip.pdf', 'application/pdf', 415],
    ['GIF renamed slip.png', gif, 'slip.png', 'image/png', 415],
    ['ZIP renamed slip.jpg', zip, 'slip.jpg', 'image/jpeg', 415],
    ['real PDF named slip.png (image/png)', SAMPLE_FILES.pdf, 'slip.png', 'image/png', 415],
    ['real PDF named slip.png (application/pdf)', SAMPLE_FILES.pdf, 'slip.png', 'application/pdf', 415],
    ['real PDF named slip.pdf but declared image/png', SAMPLE_FILES.pdf, 'slip.pdf', 'image/png', 415],
    ['real PNG named slip.pdf', SAMPLE_FILES.png, 'slip.pdf', 'application/pdf', 415],
    ['real PDF named slip.exe', SAMPLE_FILES.pdf, 'slip.exe', 'application/pdf', 415],
    ['real PDF without extension', SAMPLE_FILES.pdf, 'slip', 'application/pdf', 415],
    ['real PDF declared application/octet-stream', SAMPLE_FILES.pdf, 'slip.pdf', 'application/octet-stream', 415],
    ['0-byte slip.pdf', Buffer.alloc(0), 'slip.pdf', 'application/pdf', 415],
    ['0-byte slip.png', Buffer.alloc(0), 'slip.png', 'image/png', 415],
    ['real PDF slip.pdf', SAMPLE_FILES.pdf, 'slip.pdf', 'application/pdf', 201],
    ['real PNG slip.png', SAMPLE_FILES.png, 'slip.png', 'image/png', 201],
    ['real JPG slip.jpg', SAMPLE_FILES.jpg, 'slip.jpg', 'image/jpeg', 201],
    ['real JPG slip.JPEG (upper case)', SAMPLE_FILES.jpg, 'slip.JPEG', 'image/jpeg', 201],
  ];
  for (const [name, data, filename, type, expected] of typeCases) {
    const res = await upload(a, data, filename, type);
    check(`upload ${name} -> ${expected}`, res.status === expected, `${res.status} ${res.body?.error?.code ?? ''}`);
  }

  // Size limits.
  const exactly5mb = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(MAX_UPLOAD_BYTES - 9)]);
  const over5mb = Buffer.concat([exactly5mb, Buffer.from('x')]);
  const r5 = await upload(a, exactly5mb, 'slip.pdf', 'application/pdf');
  check('upload exactly 5 MB PDF -> 201', r5.status === 201, `${r5.status} ${r5.body?.error?.code ?? ''} sizeBytes=${r5.body?.data?.salarySlip?.sizeBytes}`);
  const r6 = await upload(a, over5mb, 'slip.pdf', 'application/pdf');
  check('upload 5 MB + 1 byte -> 413 FILE_TOO_LARGE', r6.status === 413 && r6.body.error.code === 'FILE_TOO_LARGE', `${r6.status} ${r6.body?.error?.code}`);
  const r7 = await upload(a, Buffer.concat([over5mb, Buffer.alloc(3 * 1024 * 1024)]), 'slip.pdf', 'application/pdf');
  check('upload 8 MB -> 413', r7.status === 413, r7.status);
  const anonBig = await request(app).post(SLIP).set('Origin', ORIGIN).attach('file', over5mb, { filename: 'slip.pdf', contentType: 'application/pdf' });
  check('anonymous 5 MB+ upload -> 401 (before parsing)', anonBig.status === 401, anonBig.status);
  const staffUp = await request(app).post(SLIP).set('Origin', ORIGIN).set('Cookie', staff.SANCTION.cookie).attach('file', SAMPLE_FILES.pdf, { filename: 'slip.pdf', contentType: 'application/pdf' });
  check('SANCTION upload -> 403', staffUp.status === 403, staffUp.status);

  // Polyglots: PDF magic bytes in front of HTML/JS; PDF with a JavaScript action.
  const pdfHtml = Buffer.from('%PDF-1.4\n<html><body><script>alert(document.domain)</script></body></html>\n%%EOF\n');
  const pdfJs = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /OpenAction << /S /JavaScript /JS (app.alert\\(1\\)) >> >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
  const pp = await upload(a, pdfHtml, 'slip.pdf', 'application/pdf');
  note('PDF magic + HTML/script polyglot as slip.pdf', `${pp.status} (accepted: magic bytes say PDF; served as application/pdf + nosniff + CSP default-src 'none')`);
  const pdfHtmlDl = await request(app).get(SLIP).set('Cookie', a.cookie);
  check('polyglot served back as application/pdf with nosniff and CSP default-src none',
    pdfHtmlDl.status === 200 && pdfHtmlDl.headers['content-type'] === 'application/pdf' && pdfHtmlDl.headers['x-content-type-options'] === 'nosniff' && String(pdfHtmlDl.headers['content-security-policy']).startsWith("default-src 'none'"),
    { ct: pdfHtmlDl.headers['content-type'], nosniff: pdfHtmlDl.headers['x-content-type-options'], csp: pdfHtmlDl.headers['content-security-policy'] });
  const pj = await upload(a, pdfJs, 'slip.pdf', 'application/pdf');
  note('PDF with /OpenAction JavaScript', `${pj.status}`);

  // Filename tricks.
  const nameCases: [string, string, number][] = [
    ['../../x.pdf', '../../x.pdf', 201],
    ['..\\..\\x.pdf', '..\\..\\x.pdf', 201],
    ['/etc/passwd.pdf', '/etc/passwd.pdf', 201],
    ['unicode स्लिप.pdf', 'स्लिप.pdf', 201],
    ['RTL override slip‮fdp.exe', 'slip‮fdp.exe', 415],
    ['double ext slip.pdf.exe', 'slip.pdf.exe', 415],
    ['double ext slip.exe.pdf', 'slip.exe.pdf', 201],
    ['trailing dot slip.pdf.', 'slip.pdf.', 415],
    ['dotfile .pdf', '.pdf', 415],
    ['quote slip".pdf', 'slip".pdf', 201],
    ['very long (300 chars).pdf', `${'a'.repeat(300)}.pdf`, 201],
  ];
  for (const [name, filename, expected] of nameCases) {
    const res = await upload(a, SAMPLE_FILES.pdf, filename, 'application/pdf');
    const stored = await latestGridFsFile();
    const generated = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg)$/.test(String(stored?.filename));
    check(`filename ${name} -> ${expected}${expected === 201 ? ', stored under a generated name' : ''}`,
      res.status === expected && (expected !== 201 || generated), `${res.status} ${res.body?.error?.code ?? ''} stored=${stored?.filename}`);
  }
  // NUL byte in the filename (raw multipart so the byte is really sent).
  for (const filename of ['slip\0.pdf', 'slip.pdf\0.exe', 'slip.exe\0.pdf']) {
    const res = await sendRaw(a, rawMultipart([{ name: 'file', filename, contentType: 'application/pdf', data: SAMPLE_FILES.pdf }]));
    const stored = await latestGridFsFile();
    note(`filename with NUL ${JSON.stringify(filename)}`, `${res.status} ${res.body?.error?.code ?? ''} latest stored=${stored?.filename}`);
    check(`filename with NUL ${JSON.stringify(filename)} -> not 500`, res.status < 500, res.status);
  }
  const storedNames = await mongoose.connection.db?.collection('salary_slips.files').find().project({ filename: 1, metadata: 1 }).toArray();
  check('no stored GridFS filename contains the user filename', (storedNames ?? []).every((f) => !/x\.pdf|passwd|स्लिप|aaaa|slip/.test(String(f.filename))), (storedNames ?? []).length);
  const metaKeys = new Set((storedNames ?? []).flatMap((f) => Object.keys(f.metadata ?? {})));
  check('GridFS metadata only has ownerId + contentType (no original name)', [...metaKeys].sort().join() === 'contentType,ownerId', [...metaKeys]);

  // Multipart shape: multiple files, other field names, extra fields, no file, malformed bodies.
  const twoFiles = await request(app).post(SLIP).set('Origin', ORIGIN).set('Cookie', a.cookie)
    .attach('file', SAMPLE_FILES.pdf, { filename: 'a.pdf', contentType: 'application/pdf' })
    .attach('file', SAMPLE_FILES.pdf, { filename: 'b.pdf', contentType: 'application/pdf' });
  check('two files in "file" -> 400 INVALID_UPLOAD', twoFiles.status === 400 && twoFiles.body.error.code === 'INVALID_UPLOAD', `${twoFiles.status} ${twoFiles.body?.error?.code}`);
  const otherField = await request(app).post(SLIP).set('Origin', ORIGIN).set('Cookie', a.cookie)
    .attach('document', SAMPLE_FILES.pdf, { filename: 'a.pdf', contentType: 'application/pdf' });
  check('file in another field -> 400 INVALID_UPLOAD', otherField.status === 400 && otherField.body.error.code === 'INVALID_UPLOAD', `${otherField.status} ${otherField.body?.error?.code}`);
  const extraField = await request(app).post(SLIP).set('Origin', ORIGIN).set('Cookie', a.cookie)
    .field('userId', b.id).attach('file', SAMPLE_FILES.pdf, { filename: 'a.pdf', contentType: 'application/pdf' });
  check('extra text field before the file -> 400 INVALID_UPLOAD', extraField.status === 400 && extraField.body.error.code === 'INVALID_UPLOAD', `${extraField.status} ${extraField.body?.error?.code}`);
  const extraAfter = await request(app).post(SLIP).set('Origin', ORIGIN).set('Cookie', a.cookie)
    .attach('file', SAMPLE_FILES.pdf, { filename: 'a.pdf', contentType: 'application/pdf' }).field('ownerId', b.id);
  check('extra text field after the file -> 400', extraAfter.status === 400, `${extraAfter.status} ${extraAfter.body?.error?.code}`);
  const noFile = await sendRaw(a, Buffer.from('--AUDITBOUNDARY123--\r\n'));
  check('multipart with no parts -> 400 FILE_REQUIRED', noFile.status === 400 && noFile.body.error.code === 'FILE_REQUIRED', `${noFile.status} ${noFile.body?.error?.code}`);
  const jsonBody = await request(app).post(SLIP).set('Origin', ORIGIN).set('Cookie', a.cookie).send({ file: 'x' });
  check('JSON body instead of multipart -> 400 FILE_REQUIRED', jsonBody.status === 400 && jsonBody.body.error.code === 'FILE_REQUIRED', `${jsonBody.status} ${jsonBody.body?.error?.code}`);
  const noBoundary = await sendRaw(a, rawMultipart([{ name: 'file', filename: 'a.pdf', contentType: 'application/pdf', data: SAMPLE_FILES.pdf }]), 'multipart/form-data');
  check('multipart without boundary -> 4xx (not 500)', noBoundary.status >= 400 && noBoundary.status < 500, `${noBoundary.status} ${JSON.stringify(noBoundary.body)}`);
  const full = rawMultipart([{ name: 'file', filename: 'a.pdf', contentType: 'application/pdf', data: SAMPLE_FILES.pdf }]);
  const truncated = await sendRaw(a, full.subarray(0, full.length - 30));
  check('truncated multipart body -> 4xx (not 500)', truncated.status >= 400 && truncated.status < 500, `${truncated.status} ${JSON.stringify(truncated.body)}`);
  const garbage = await sendRaw(a, Buffer.from('this is not multipart at all'));
  check('garbage multipart body -> 4xx (not 500)', garbage.status >= 400 && garbage.status < 500, `${garbage.status} ${JSON.stringify(garbage.body)}`);

  // Re-upload a known PDF for A and a PNG for B, then test downloads.
  await upload(a, SAMPLE_FILES.pdf, 'slip.pdf', 'application/pdf');
  await upload(b, SAMPLE_FILES.png, 'slip.png', 'image/png');
  const gridCount = await mongoose.connection.db?.collection('salary_slips.files').countDocuments();
  note('GridFS files after all uploads (old ones replaced and removed)', gridCount);

  const anonDl = await request(app).get(SLIP);
  check('anonymous own-slip download -> 401', anonDl.status === 401, anonDl.status);
  for (const role of ['ADMIN', 'SALES', 'SANCTION', 'DISBURSEMENT', 'COLLECTION'] as const) {
    const res = await request(app).get(SLIP).set('Cookie', staff[role].cookie);
    check(`${role} own-slip route -> 403`, res.status === 403, res.status);
  }
  const aDl = await request(app).get(SLIP).set('Cookie', a.cookie).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
  const bDl = await request(app).get(SLIP).set('Cookie', b.cookie).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
  check('A gets exactly A\'s PDF, B gets exactly B\'s PNG', Buffer.compare(aDl.body as Buffer, SAMPLE_FILES.pdf) === 0 && Buffer.compare(bDl.body as Buffer, SAMPLE_FILES.png) === 0, { a: aDl.headers['content-type'], b: bDl.headers['content-type'] });
  const h = aDl.headers;
  check('download headers: nosniff, private no-store, per-response CSP, inline generated filename',
    h['x-content-type-options'] === 'nosniff' && h['cache-control'] === 'private, no-store' && h['content-security-policy'] === "default-src 'none'; object-src 'self'; frame-ancestors 'self'" && h['content-disposition'] === 'inline; filename="salary-slip.pdf"',
    { nosniff: h['x-content-type-options'], cache: h['cache-control'], csp: h['content-security-policy'], cd: h['content-disposition'], len: h['content-length'] });
  note('other download headers', { xfo: h['x-frame-options'], corp: h['cross-origin-resource-policy'], coop: h['cross-origin-opener-policy'], hsts: h['strict-transport-security'] });
  const queryTry = await request(app).get(`${SLIP}?userId=${b.id}`).set('Cookie', a.cookie);
  check('A with ?userId=<B> still gets A\'s slip (query ignored)', queryTry.status === 200 && queryTry.headers['content-type'] === 'application/pdf', `${queryTry.status} ${queryTry.headers['content-type']}`);
  const noSlip = await createTestUser('BORROWER', 'noslip@audit.dev');
  const noSlipDl = await request(app).get(SLIP).set('Cookie', noSlip.cookie);
  check('borrower without a slip -> 404', noSlipDl.status === 404, noSlipDl.status);

  // Slip by loan: A applies; who can fetch /loans/:id/salary-slip?
  const applied = await request(app).post('/api/v1/borrower/loans').set('Origin', ORIGIN).set('Cookie', a.cookie).send(LOAN_REQUEST);
  const loanId = applied.body.data.loan.id as string;
  const byLoan = (cookie?: string) => { const r = request(app).get(`/api/v1/loans/${loanId}/salary-slip`); return cookie ? r.set('Cookie', cookie) : r; };
  const expectations: [string, string | undefined, number][] = [
    ['anonymous', undefined, 401], ['owner borrower A', a.cookie, 403], ['borrower B', b.cookie, 403],
    ['SALES', staff.SALES.cookie, 403], ['DISBURSEMENT', staff.DISBURSEMENT.cookie, 403], ['COLLECTION', staff.COLLECTION.cookie, 403],
    ['SANCTION (APPLIED)', staff.SANCTION.cookie, 200], ['ADMIN', staff.ADMIN.cookie, 200],
  ];
  for (const [who, cookie, expected] of expectations) {
    const res = await byLoan(cookie);
    check(`slip-by-loan as ${who} -> ${expected}`, res.status === expected, res.status);
  }
  const sanctionDl = await byLoan(staff.SANCTION.cookie);
  check('slip-by-loan response has the same private headers', sanctionDl.headers['cache-control'] === 'private, no-store' && sanctionDl.headers['x-content-type-options'] === 'nosniff' && String(sanctionDl.headers['content-security-policy']).startsWith("default-src 'none'"), { cache: sanctionDl.headers['cache-control'] });
  await request(app).post(`/api/v1/loans/${loanId}/approve`).set('Origin', ORIGIN).set('Cookie', staff.SANCTION.cookie).send({});
  const afterApprove = await byLoan(staff.SANCTION.cookie);
  check('slip-by-loan as SANCTION after approval (SANCTIONED) -> 404', afterApprove.status === 404, afterApprove.status);
  const adminAfter = await byLoan(staff.ADMIN.cookie);
  check('slip-by-loan as ADMIN after approval -> 200', adminAfter.status === 200, adminAfter.status);
  const badId = await request(app).get('/api/v1/loans/not-an-id/salary-slip').set('Cookie', staff.ADMIN.cookie);
  const missingId = await request(app).get(`/api/v1/loans/${new mongoose.Types.ObjectId().toString()}/salary-slip`).set('Cookie', staff.ADMIN.cookie);
  check('slip-by-loan invalid id -> 400, unknown id -> 404', badId.status === 400 && missingId.status === 404, [badId.status, missingId.status]);
  const slipFileId = (await mongoose.connection.db?.collection('loans').findOne({}))?.salarySlip?.fileId?.toString();
  const byFileId = await request(app).get(`/api/v1/loans/${slipFileId}/salary-slip`).set('Cookie', staff.ADMIN.cookie);
  check('a GridFS file id used as a loan id -> 404 (no file-id route)', byFileId.status === 404, byFileId.status);

  summary();
  await stopTestDatabase();
}

main().catch(async (error) => {
  process.stdout.write(`CRASH ${String(error?.stack ?? error)}\n`);
  await stopTestDatabase();
  process.exit(1);
});
