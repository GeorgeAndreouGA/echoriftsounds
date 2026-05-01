# syntax=docker/dockerfile:1.7
#
# Unified multi-target Dockerfile for the echorift monorepo.
# Two targets are exposed: `api-runner` and `web-runner`. Both share the same
# pnpm fetch + install + shared-build layers, so a `--no-cache` rebuild does
# that work once per invocation instead of twice (it used to run in full from
# both apps/api/Dockerfile and apps/web/Dockerfile).

# ---- base ----
FROM node:22-alpine AS base
RUN corepack enable
RUN corepack prepare pnpm@10.33.0 --activate
ENV PNPM_HOME=/pnpm
ENV PNPM_STORE_DIR=/pnpm/store
RUN pnpm config set store-dir /pnpm/store
WORKDIR /workspace

# ---- fetch ----
# Only the lockfile + workspace metadata + every workspace package.json. This
# stage is cache-stable as long as those files don't change.
FROM base AS fetch
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .pnpmfile.cjs ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch --fetch-timeout 120000

# ---- install ----
# Single install pass for the whole workspace; both api-build and web-build
# branch from here so we never link node_modules twice in one build.
FROM fetch AS install
ENV CI=true
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --ignore-scripts

# ---- shared-build ----
# Compile @echorift/shared once; both api and web depend on it.
FROM install AS shared-build
COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
RUN pnpm --filter @echorift/shared build

# ---- api-build ----
FROM shared-build AS api-build
COPY apps/api/ apps/api/
RUN pnpm --filter @echorift/api build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @echorift/api --prod deploy --legacy /deploy

# ---- api-runner ----
FROM node:22-alpine AS api-runner
WORKDIR /app
# ffmpeg + ffprobe are used by PeaksService to decode audio and extract
# per-second peak amplitudes without loading the full file into memory.
RUN apk add --no-cache ffmpeg \
 && addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nodejs \
 && mkdir -p /app/data /app/data/peaks /app/music \
 && chown -R nodejs:nodejs /app/data \
 && chmod 755 /app/data /app/data/peaks /app/music
COPY --from=api-build --chown=nodejs:nodejs /deploy/node_modules ./node_modules
COPY --from=api-build --chown=nodejs:nodejs /deploy/dist          ./dist
USER nodejs
ENV NODE_ENV=production
CMD ["node", "dist/main.js"]

# ---- web-build ----
FROM shared-build AS web-build
ARG API_INTERNAL_URL=http://localhost:3001
ENV API_INTERNAL_URL=$API_INTERNAL_URL
COPY apps/web/ apps/web/
RUN --mount=type=cache,id=next-cache,target=/workspace/apps/web/.next/cache \
    pnpm --filter @echorift/web build

# ---- web-runner ----
FROM node:22-alpine AS web-runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nodejs
COPY --from=web-build --chown=nodejs:nodejs /workspace/apps/web/.next/standalone ./
COPY --from=web-build --chown=nodejs:nodejs /workspace/apps/web/.next/static    ./apps/web/.next/static
COPY --from=web-build --chown=nodejs:nodejs /workspace/apps/web/public           ./apps/web/public
USER nodejs
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
