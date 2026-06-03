# @aicos/shared

Cross-cutting runtime utilities shared across the AICOS workspaces (NestJS `api`/`worker`, and indirectly the apps). CommonJS library, built with `tsc`.

## Modules

| Module | Exports |
|--------|---------|
| `env` | `envSchema` (zod), `Env`, `loadEnv()`, `getEnv()` — validated, typed `process.env` |
| `result` | `Result<T,E>`, `ok`, `err`, `isOk`, `isErr`, `mapResult`, `unwrapOr` |
| `errors` | `AppError` + subclasses (`BadRequest`, `Validation`, `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `RateLimit`, `TenantMismatch`, `PaymentRequired`, `Internal`), `ERROR_CODES`, `isAppError` |
| `money` | `toCents()`, `fromCents()`, `formatMoney()` (integer minor-unit arithmetic) |
| `ids` | `slugify()`, `uniqueSlug()`, `skuFromTitle()`, `randomCode()` |
| `queues` | BullMQ queue names + job payload contracts (`extractionJobId`, etc.) |

```ts
import { getEnv, ok, err, NotFoundError, toCents, slugify } from '@aicos/shared';

const env = getEnv();                    // throws on misconfiguration at boot
const price = toCents(19.99, 'USD');     // 1999
const slug = slugify('Cold Brew 500ml'); // "cold-brew-500ml"
```

## Conventions
- Money is **always** integer minor units — never floats. Use `toCents`/`fromCents` only at the boundaries.
- Throw `AppError` subclasses; the API's exception filter maps them to the `ApiError` envelope from `@aicos/types`.
- `env` validation runs once via `getEnv()` (cached). Fail fast, fail loud.

## Scripts
| Command | Action |
|--------|--------|
| `pnpm build` | Compile to `dist/` (CommonJS) |
| `pnpm typecheck` | Type-check without emit |
| `pnpm lint` | Lint `src` |
| `pnpm clean` | Remove `dist/` |
