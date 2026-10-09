import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { signAuthToken, verifyAuthToken } from '../../src/utils/jwt.js';

const SECRET = 'unit-test-secret-that-is-long-enough!!';

describe('auth tokens', () => {
  it('round-trips the user id and role', async () => {
    const token = await signAuthToken({ userId: 'abc123', role: 'SANCTION' }, SECRET);
    await expect(verifyAuthToken(token, SECRET)).resolves.toEqual({
      userId: 'abc123',
      role: 'SANCTION',
    });
  });

  it('rejects a token signed with another secret', async () => {
    const token = await signAuthToken({ userId: 'abc123', role: 'ADMIN' }, `${SECRET}-other`);
    await expect(verifyAuthToken(token, SECRET)).rejects.toThrow();
  });

  it('rejects a token signed with a different algorithm', async () => {
    const token = await new SignJWT({ role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS512' })
      .setSubject('abc123')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET));
    await expect(verifyAuthToken(token, SECRET)).rejects.toThrow();
  });

  it('rejects a token with an unknown role', async () => {
    const token = await new SignJWT({ role: 'SUPERUSER' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('abc123')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET));
    await expect(verifyAuthToken(token, SECRET)).rejects.toThrow();
  });
});
