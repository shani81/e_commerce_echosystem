import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
  // Access tokens are RS256 (asymmetric): other services verify them with the
  // PUBLIC key, never holding a signing secret. Keys are loaded from `.keys/`
  // (run `pnpm keys:gen`) or, for CI/prod, inline via env (PEM or base64).
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_PRIVATE_KEY_PATH: z.string().optional(),
  JWT_PUBLIC_KEY_PATH: z.string().optional(),
  // Refresh tokens stay HS256 (symmetric) — only this API verifies them.
  JWT_REFRESH_SECRET: z
    .string()
    .min(16, 'JWT_REFRESH_SECRET must be >= 16 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  // --- Billing / Stripe (skeleton — verification wired later) ---------------
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // --- Object storage / S3-compatible (MinIO locally, S3/R2 in prod) --------
  // Endpoint may be absent (e.g. in tests); presign throws a clear 503 then.
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('aicos-media'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().default('true'),

  // --- Search / Meilisearch -------------------------------------------------
  // Host always has a default; the master key may be absent (search degrades
  // gracefully — indexing/search become no-ops and the proxy returns empty).
  MEILI_HOST: z.string().url().default('http://localhost:7700'),
  MEILI_MASTER_KEY: z.string().optional(),
  MEILI_PRODUCTS_INDEX: z.string().default('products'),
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

const DEFAULT_PRIVATE_KEY_REL = '.keys/jwt_access_private.pem';
const DEFAULT_PUBLIC_KEY_REL = '.keys/jwt_access_public.pem';

/** Walk up from the CWD (max 5 levels) looking for a repo-relative file. */
function findUp(rel: string): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = resolve(dir, rel);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Resolve a PEM key from, in priority order: an inline value (PEM or base64),
 * an explicit file path, or the default `.keys/` location found by walking up
 * from the CWD. Throws a readable error when nothing is found.
 */
function resolveKey(
  inline: string | undefined,
  explicitPath: string | undefined,
  defaultRel: string,
  envVar: string,
): string {
  if (inline && inline.trim()) {
    const v = inline.trim();
    return v.includes('BEGIN') ? v : Buffer.from(v, 'base64').toString('utf8');
  }
  const path = explicitPath ? resolve(process.cwd(), explicitPath) : findUp(defaultRel);
  if (path && existsSync(path)) return readFileSync(path, 'utf8');
  throw new Error(
    `Missing JWT key. Set ${envVar} (PEM or base64) or generate a dev keypair ` +
      `with \`pnpm keys:gen\` (expected at ${defaultRel}).`,
  );
}

/**
 * Structured configuration factory consumed by `ConfigModule.forRoot({ load })`.
 * Re-parses (cheap) so namespaced access (`config.get('jwt.accessPrivateKey')`)
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
      // RS256 access-token keypair (private signs, public verifies).
      accessPrivateKey: resolveKey(
        env.JWT_PRIVATE_KEY,
        env.JWT_PRIVATE_KEY_PATH,
        DEFAULT_PRIVATE_KEY_REL,
        'JWT_PRIVATE_KEY',
      ),
      accessPublicKey: resolveKey(
        env.JWT_PUBLIC_KEY,
        env.JWT_PUBLIC_KEY_PATH,
        DEFAULT_PUBLIC_KEY_REL,
        'JWT_PUBLIC_KEY',
      ),
      // HS256 refresh secret.
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshTtl: env.JWT_REFRESH_TTL,
    },
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    },
    s3: {
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKey: env.S3_ACCESS_KEY,
      secretKey: env.S3_SECRET_KEY,
      // String env -> boolean; any value other than "false" enables path-style
      // addressing (required by MinIO and most S3-compatible stores).
      forcePathStyle: env.S3_FORCE_PATH_STYLE !== 'false',
    },
    meili: {
      host: env.MEILI_HOST,
      apiKey: env.MEILI_MASTER_KEY,
      productsIndex: env.MEILI_PRODUCTS_INDEX,
    },
  };
}

export type AppConfig = ReturnType<typeof configuration>;
