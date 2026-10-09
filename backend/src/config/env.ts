import { z } from 'zod';

const DEFAULT_PORT = 4000;
const MIN_JWT_SECRET_LENGTH = 32;

/** Parses a comma-separated list of origins and normalises each one (scheme + host + port). */
const originListSchema = z
  .string()
  .min(1)
  .transform((value, context) => {
    const origins: string[] = [];
    for (const entry of value.split(',')) {
      const trimmed = entry.trim();
      if (trimmed === '') continue;
      try {
        origins.push(new URL(trimmed).origin);
      } catch {
        context.addIssue({ code: 'custom', message: `"${trimmed}" is not a valid origin` });
        return z.NEVER;
      }
    }
    return origins;
  });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, 'must be a mongodb:// or mongodb+srv:// URI'),
  JWT_SECRET: z
    .string()
    .min(MIN_JWT_SECRET_LENGTH, `must be at least ${MIN_JWT_SECRET_LENGTH} characters`),
  CORS_ORIGINS: originListSchema,
  // Number of proxies in front of the app (never `true`, so the client IP can't be spoofed freely).
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates environment variables. Throws one readable error listing every problem,
 * so the process crashes at startup instead of failing later.
 */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${problems}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);
export const isProduction = env.NODE_ENV === 'production';
