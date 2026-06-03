# @aicos/admin

AICOS admin dashboard — **Next.js 15 (App Router) + React 19 + Tailwind**, served on **port 3100**.

This is the **Phase 0 shell**: an authenticated-_looking_ dashboard with sidebar
navigation, a topbar, and a placeholder KPI grid, plus a login page stub that
POSTs to the API. There is no real session wiring yet — the structure is in place
so auth, data fetching, and per-domain routes drop in cleanly later.

## Stack

- **Next.js 15** App Router, `src/` directory, route groups.
- **React 19**.
- **Tailwind CSS 3** with the color scale mirrored from the design tokens in
  [`@aicos/ui`](../../packages/ui).
- **[`@aicos/ui`](../../packages/ui)** — shared design system (`Button`, `Card`,
  `cn`, tokens). Ships source `.tsx`; this app transpiles it via
  `transpilePackages`.
- **[`@aicos/types`](../../packages/types)** — shared API/auth types
  (`ApiResponse`, `TokenPair`) used to type the login round-trip.

## Scripts

| Script           | Command         | Description                          |
| ---------------- | --------------- | ------------------------------------ |
| `pnpm dev`       | `next dev -p 3100`  | Dev server on http://localhost:3100 |
| `pnpm build`     | `next build`        | Production build                     |
| `pnpm start`     | `next start -p 3100`| Serve the production build           |
| `pnpm lint`      | `next lint`         | Lint                                 |
| `pnpm typecheck` | `tsc --noEmit`      | Type-check only                      |

From the repo root: `pnpm --filter @aicos/admin dev`.

## Configuration

Copy `.env.example` to `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

The login form posts to `${NEXT_PUBLIC_API_URL}/api/v1/auth/login` (the API is
locked to port 4000). With no API running, the login page surfaces a friendly
connection error — that's expected in Phase 0.

## Structure

```
src/
  app/
    layout.tsx              # Root layout (html/body, fonts, globals.css)
    globals.css             # Tailwind layers + base resets
    (dashboard)/
      layout.tsx            # Sidebar + topbar chrome (route group, no URL segment)
      page.tsx              # Overview: KPI stat-card grid + placeholder panels
    login/
      page.tsx              # Login form stub (POSTs to the API)
  components/
    sidebar.tsx             # Left nav (Catalog/Orders/Inventory/Billing/AI Extraction)
    topbar.tsx              # Top bar (title, search stub, account cluster)
    stat-card.tsx           # KPI tile used by the overview grid
  lib/
    nav.ts                  # Sidebar navigation model (single source of truth)
```

The `(dashboard)` route group applies the authenticated chrome to in-app pages
while keeping `/login` outside it (login renders standalone).

## Phase 0 scope & next steps

- [x] Dashboard shell (sidebar, topbar, KPI placeholder grid).
- [x] Login page stub posting to `/api/v1/auth/login`.
- [ ] Real session handling (token storage, redirect, route guard / middleware).
- [ ] Live data for the overview and per-domain routes (Catalog, Orders, …).
