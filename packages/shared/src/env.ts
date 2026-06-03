// Environment configuration — a single zod schema validated once at process
// boot. Importing `env` from here gives every service a typed, validated view of
// `process.env`; misconfiguration fails fast and loudly instead of at runtime.

import { z } from 'zod';

/** Coerce common truthy/falsey env strings to a boolean. */
const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

/** The canonical AICOS environment schema (mirrors `.env.example`). */
export const envSchema = z.object({
  // --- App ---
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('AICOS'),

  // App URLs / ports (locked per project-ports.json: web 3000, admin 3100, api 4000, worker 4100)
  WEB_URL: z.string().url().default('http://localhost:3000'),
  ADMIN_URL: z.string().url().default('http://localhost:3100'),
  API_URL: z.string().url().default('http://localhost:4000'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  ADMIN_PORT: z.coerce.number().int().positive().default(3100),
  WORKER_PORT: z.coerce.number().int().positive().default(4100),

  // --- PostgreSQL ---
  DATABASE_URL: z.string().url(),

  // --- Redis (cache + BullMQ) ---
  REDIS_URL: z.string().url().default('redis://localhost:6400'),

  // --- Meilisearch ---
  MEILI_HOST: z.string().url().optional(),
  MEILI_MASTER_KEY: z.string().optional(),

  // --- Object storage (S3-compatible) ---
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('aicos-media'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: boolFromString.default(true),

  // --- Mail ---
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  MAIL_FROM: z.string().default('no-reply@aicos.local'),

  // --- Auth ---
  JWT_ACCESS_SECRET: z.string().min(1).default('change_me_access_secret'),
  JWT_REFRESH_SECRET: z.string().min(1).default('change_me_refresh_secret'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  // --- AI providers ---
  AI_DEFAULT_PROVIDER: z.enum(['anthropic', 'openai', 'gemini']).default('anthropic'),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),

  // --- Stripe ---
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
});

/** Fully parsed, typed environment. */
export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate an environment object (defaults to `process.env`).
 * Throws a readable aggregated error listing every invalid/missing variable.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

let cached: Env | undefined;

/**
 * Lazily load + cache the validated environment. Prefer this in app code so the
 * schema is parsed exactly once per process.
 */
export function getEnv(): Env {
  if (!cached) cached = loadEnv();
  return cached;
}
