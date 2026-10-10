import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { REDACTED_PATHS } from '../../src/config/logger.js';

describe('log redaction', () => {
  it('never writes cookies, auth headers or passwords to the logs', () => {
    let output = '';
    const sink = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = pino({ redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' } }, sink);

    logger.info(
      {
        req: { headers: { cookie: 'lms_token=secret-jwt', authorization: 'Bearer secret' } },
        res: { headers: { 'set-cookie': 'lms_token=secret-jwt' } },
        user: { password: 'Password@123', passwordHash: '$2b$10$hash' },
      },
      'request',
    );

    expect(output).toContain('[REDACTED]');
    for (const secret of ['secret-jwt', 'Bearer secret', 'Password@123', '$2b$10$hash']) {
      expect(output).not.toContain(secret);
    }
  });
});
