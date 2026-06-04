# syntax=docker/dockerfile:1
# AICOS API — NestJS HTTP app. pnpm monorepo build (install → prisma generate →
# build api + its workspace deps). RS256 JWT keys + all secrets are injected at
# runtime via env (never baked in) — see .ai/runbooks/deployment.md.
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo

FROM base AS build
RUN apk add --no-cache openssl
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @aicos/db run generate \
 && pnpm --filter "@aicos/api..." run build

FROM build AS runtime
ENV NODE_ENV=production
WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["node", "dist/main.js"]
