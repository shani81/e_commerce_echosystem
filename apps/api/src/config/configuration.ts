import { z } from 'zod';

/**
 * Environment schema for @aicos/api.
 *
 * Parsed once at boot (see {@link validateEnv}, wired into
 * `ConfigModule.forRoot({ validate })`). A failed parse aborts startup with a
 * readable message instead of letting an undefined secret blow up at runtime.
 *
 * Keep secrets in the environment (see `.env.example`) — never commit real values.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  // --- Networking -----------------------------------------------------------
  API_PORT: z.coerce.number().int().positive().default(4000),
  // Comma-separated list of allowed CORS origins; '*' allows all (dev only).
  CORS_ORIGINS: z.string().default('*'),

  // --- Datastores -----------------------------------------------------------
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // --- Auth / JWT -----------------------------------------------------------
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be >= 16 chars'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16, 'JWT_REFRESH_SECRET must be >= 16 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  // --- Billing / Stripe (skeleton — verification wired later) ---------------
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validator passed to `ConfigModule.forRoot({ validate })`. Receives the raw
 * `process.env` record and returns the parsed, typed config (Nest then exposes
 * it via `ConfigService`). Throws with the flattened zod issues on failure.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

/**
 * Structured configuration factory consumed by `ConfigModule.forRoot({ load })`.
 * Re-parses (cheap) so namespaced access (`config.get('jwt.accessSecret')`)
 * works alongside flat access (`config.get('DATABASE_URL')`).
 */
export function configuration() {
  const env = validateEnv(process.env);
  return {
    nodeEnv: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    http: {
      port: env.API_PORT,
      corsOrigins:
        env.CORS_ORIGINS === '*'
          ? true
          : env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
    },
    database: {
      url: env.DATABASE_URL,
    },
    redis: {
      url: env.REDIS_URL,
    },
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshTtl: env.JWT_REFRESH_TTL,
    },
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    },
  };
}

export type AppConfig = ReturnType<typeof configuration>;
