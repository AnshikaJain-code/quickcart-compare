import { z } from 'zod';

/**
 * Environment validation. Secrets live only in env vars (CLAUDE.md rule 7).
 * `loadEnv` takes the source explicitly so it can be unit tested.
 */
const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z
    .string()
    .min(1, 'MONGODB_URI is required')
    .refine((v) => /^mongodb(\+srv)?:\/\//.test(v), {
      message: 'MONGODB_URI must start with mongodb:// or mongodb+srv:// (copy it from Atlas)',
    })
    .refine((v) => !/[<>]/.test(v), {
      message:
        'MONGODB_URI still contains <placeholders>: replace <db-user>, <db-password> and the host with real values (no angle brackets)',
    })
    .refine((v) => /^mongodb(\+srv)?:\/\/[^/]+\/[^/?\s]+/.test(v), {
      message:
        'MONGODB_URI must include a database name, e.g. ...mongodb.net/quickcart-compare?retryWrites=true',
    }),
  CLIENT_ORIGIN: z.string().url('CLIENT_ORIGIN must be a valid URL'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  /** Number of reverse proxies in front of the server (hosting). 0 = none. Needed for correct rate limiting. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  /** Per-provider adapter time limit for /compare. */
  ADAPTER_TIMEOUT_MS: z.coerce.number().int().min(50).max(10_000).default(3000),
  /** Optional: treat quotes older than this as STALE even before they expire. */
  QUOTE_STALE_AFTER_MINUTES: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).optional(),
  ),
  GEOCODING_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
  PROVIDER_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n - ${issues.join('\n - ')}`);
    this.name = 'EnvValidationError';
  }
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((i) => `${i.path.join('.') || 'env'}: ${i.message}`),
    );
  }
  return result.data;
}
