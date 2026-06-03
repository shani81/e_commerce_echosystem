# @aicos/web — Customer Storefront

The AICOS customer-facing storefront. **Next.js 15** (App Router) · **React 19** · **Tailwind CSS** · port **3000**.

> _Film your shelves. Publish your store. In minutes._

## Phase 0 scope

A polished, minimal landing page that proves the stack end-to-end:

- The **AICOS brand** and the _"film your shelves"_ value proposition.
- A three-step **value-prop** overview (film → AI builds catalog → review & publish).
- A **live API health** check (`<ApiHealth />`) that fetches the backend
  `GET http://localhost:4000/api/v1/health` from the browser and degrades
  gracefully when the API isn't running yet.

It deliberately renders the shared design system (`@aicos/ui`: `Button`, `Card`,
`Badge`) and consumes the shared API envelope types (`@aicos/types`: `ApiResponse`).

## Layout

```
apps/web/
├─ next.config.mjs        # transpilePackages: @aicos/ui, @aicos/types
├─ tailwind.config.ts     # maps @aicos/ui tokens; includes packages/ui/src in content
├─ postcss.config.mjs     # tailwindcss + autoprefixer
├─ tsconfig.json          # extends packages/config/tsconfig/next.json
└─ src/
   ├─ app/
   │  ├─ layout.tsx       # metadata, Inter font, globals
   │  ├─ page.tsx         # hero + value props + <ApiHealth/>
   │  └─ globals.css      # Tailwind directives + base tokens
   └─ components/
      └─ api-health.tsx   # "use client" — live API health probe
```

## Commands

Run from the **repo root** (turbo) or this folder via pnpm filter:

```bash
pnpm --filter @aicos/web dev        # next dev -p 3000
pnpm --filter @aicos/web build      # next build
pnpm --filter @aicos/web start      # next start -p 3000
pnpm --filter @aicos/web lint       # next lint
pnpm --filter @aicos/web typecheck  # tsc --noEmit
```

Then open <http://localhost:3000>.

## Design system

`@aicos/ui` ships **source `.tsx`** (no build step); this app transpiles it via
`transpilePackages`. The Tailwind theme maps the package's design tokens
(`brand` indigo accent, `neutral` slate scale, radii, shadows) so utilities like
`bg-brand-600` resolve identically here and inside the imported components. The
`packages/ui/src` glob is in `content` so those classes survive purge.

## API health & configuration

`<ApiHealth />` runs client-side. It targets
`NEXT_PUBLIC_API_HEALTH_URL` (default `http://localhost:4000/api/v1/health`),
accepts either a bare `{ status }` body or the `ApiResponse` envelope, times out
after 4s, and shows **Online / Degraded / Offline** without ever throwing.

| Env var | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_HEALTH_URL` | `http://localhost:4000/api/v1/health` | API health endpoint the storefront probes |

> Locked ports (see `.ai/config/project-ports.json`): web **3000**, admin **3100**, api **4000**, worker **4100**.
