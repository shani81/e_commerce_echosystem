# @aicos/types

Framework-agnostic shared TypeScript types for the AICOS platform. Consumed by the NestJS services (`api`, `worker`), the Next.js apps (`web`, `admin`) and the other shared libraries. Zero runtime dependencies (a handful of money helpers aside).

## Contents

| Module | Exports |
|--------|---------|
| `api` | `ApiError`, `Paginated<T>`, `PaginationMeta`, `ApiResponse<T>` (`ApiSuccess`/`ApiFailure` union) |
| `auth` | `Persona` enum, `JwtPayload` (`{ sub, tid, roles }`), `TokenPair`, `AuthenticatedUser` |
| `money` | `Cents` branded type, `Money`, `cents()`, `money()`, `addCents`/`subCents`/`mulCents`, `ZERO_CENTS` |

```ts
import { ApiResponse, Persona, Cents, cents } from '@aicos/types';

const total: Cents = cents(1999); // €19.99 in minor units
```

## Conventions
- Money is **always** integer minor units (`Cents`) — never floats. The brand prevents passing a raw `number` where cents are expected.
- `Persona` mirrors the `RoleType` enum in `@aicos/db`'s Prisma schema; keep them in sync.

## Scripts
| Command | Action |
|--------|--------|
| `pnpm build` | Compile to `dist/` (CommonJS) |
| `pnpm typecheck` | Type-check without emit |
| `pnpm lint` | Lint `src` |
| `pnpm clean` | Remove `dist/` |
