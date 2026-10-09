import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.js';

const validEnv = {
  MONGODB_URI: 'mongodb+srv://user:pass@cluster.example.net/lms_dev',
  JWT_SECRET: 'x'.repeat(32),
  CORS_ORIGINS: 'http://localhost:3000',
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv(validEnv);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.TRUST_PROXY_HOPS).toBe(1);
  });

  it('normalises CORS origins and drops trailing slashes and paths', () => {
    const env = parseEnv({
      ...validEnv,
      CORS_ORIGINS: 'http://localhost:3000/, https://lms.example.app/login',
    });
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000', 'https://lms.example.app']);
  });

  it('rejects a JWT secret shorter than 32 characters', () => {
    expect(() => parseEnv({ ...validEnv, JWT_SECRET: 'too-short' })).toThrow(/JWT_SECRET/);
  });

  it('lists every problem at once', () => {
    expect(() => parseEnv({})).toThrow(/MONGODB_URI[\s\S]*JWT_SECRET[\s\S]*CORS_ORIGINS/);
  });

  it('rejects an invalid origin', () => {
    expect(() => parseEnv({ ...validEnv, CORS_ORIGINS: 'not a url' })).toThrow(/CORS_ORIGINS/);
  });
});
