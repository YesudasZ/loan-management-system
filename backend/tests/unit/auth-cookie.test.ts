import type { CookieOptions, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Loads auth-cookie.ts fresh with the given NODE_ENV (env is read once, at import). */
async function setCookieWith(nodeEnv: string): Promise<CookieOptions> {
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.resetModules();
  const { setAuthCookie } = await import('../../src/utils/auth-cookie.js');
  const cookie = vi.fn();
  setAuthCookie({ cookie } as unknown as Response, 'token');
  return cookie.mock.calls[0]?.[2] as CookieOptions;
}

describe('session cookie flags', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('is httpOnly, SameSite=Lax, path / and Secure in production', async () => {
    const options = await setCookieWith('production');

    expect(options).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
    expect(options.domain).toBeUndefined();
  });

  it('is not Secure in development (plain http://localhost)', async () => {
    const options = await setCookieWith('development');
    expect(options.secure).toBe(false);
  });
});
