# syntax=docker/dockerfile:1
# AICOS worker — NestJS BullMQ processors (extraction, billing, notifications, dsar).
# pnpm monorepo build: install the workspace, generate the Prisma client (on the
# alpine target so the engine matches), build the worker + its workspace deps.
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /repo

FROM base AS build
# openssl is needed by Prisma's query engine at generate/runtime on alpine.
RUN apk add --no-cache openssl
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @aicos/db run generate \
 && pnpm --filter "@aicos/worker..." run build

# Runtime: same toolchain layer (pnpm symlinked node_modules don't survive a
# selective COPY across stages). Size optimization (pnpm deploy / distroless) is
# a documented follow-up — see .ai/runbooks/deployment.md.
FROM build AS runtime
ENV NODE_ENV=production
WORKDIR /repo/apps/worker
EXPOSE 4100
CMD ["node", "dist/main.js"]
