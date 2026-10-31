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
# `COPY` preserves mode bits from the build context, and the runner below runs as
# uid 1000 — so a locked-down checkout (e.g. scripts/harden-permissions.sh) would
# otherwise bake unreadable files into the image. Only @echorift/shared crosses
# that boundary (every other dep is fetched in-image with umask 022), and its
# package.json alone is enough to break module resolution. Normalise here, in the
# build stage, so the extra layer is discarded rather than shipped: `a+rX` adds
# read for all and search/execute only on dirs and already-executable files.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @echorift/api --prod deploy --legacy /deploy \
 && chmod -R a+rX /deploy

# ---- api-runner ----
FROM node:22-alpine AS api-runner
WORKDIR /app
# ffmpeg + ffprobe are used by PeaksService to decode audio and extract
# per-second peak amplitudes without loading the full file into memory.
#
# Least privilege: the runtime identity is the base image's unprivileged `node`
# user (uid/gid 1000) — the same uid the compose `user:` sets and that owns the
# data volume, so there is one non-root identity instead of the old 1000/1001
# split. The data dirs are 700 (owner-only). App code is copied root-owned and
# only world-readable below, so the runtime user can execute it but never write
# it, even if the read-only rootfs were ever removed.
RUN apk add --no-cache ffmpeg \
 && mkdir -p /app/data /app/data/peaks /app/music \
 && chown -R node:node /app/data \
 && chmod 700 /app/data /app/data/peaks
COPY --from=api-build --chown=root:root /deploy/node_modules ./node_modules
COPY --from=api-build --chown=root:root /deploy/dist          ./dist
USER node
ENV NODE_ENV=production
CMD ["node", "dist/main.js"]

# ---- web-build ----
FROM shared-build AS web-build
ARG API_INTERNAL_URL=http://localhost:3001
ENV API_INTERNAL_URL=$API_INTERNAL_URL
# Subpath the app is served under (e.g. /music). Next bakes basePath + every
# client-side URL prefix at build time, so this must be a build arg, not runtime.
ARG BASE_PATH=
ENV NEXT_PUBLIC_BASE_PATH=$BASE_PATH
COPY apps/web/ apps/web/
# The motion scale is duplicated between components/motion/tokens.ts (framer needs
# literal numbers) and globals.css (@keyframes need literal custom properties).
# Fail here rather than shipping a split-brain scale — see tokens.ts.
RUN node apps/web/scripts/check-motion-tokens.mjs
RUN --mount=type=cache,id=next-cache,target=/workspace/apps/web/.next/cache \
    pnpm --filter @echorift/web build
# Same reason as api-build above: `public/` is copied from the build context, so
# host modes would otherwise follow the icons into the image and the uid-1000
# server could not read the assets it serves.
RUN chmod -R a+rX /workspace/apps/web/.next/standalone \
                  /workspace/apps/web/.next/static \
                  /workspace/apps/web/public

# ---- web-runner ----
FROM node:22-alpine AS web-runner
WORKDIR /app
# Same least-privilege posture as api-runner: code owned by root and only
# world-readable, served by the base image's unprivileged `node` user (uid 1000).
# The Next standalone server writes nothing under /app at runtime (rootfs is
# read-only; scratch goes to the tmpfs /tmp), so it needs no writable path here.
COPY --from=web-build --chown=root:root /workspace/apps/web/.next/standalone ./
COPY --from=web-build --chown=root:root /workspace/apps/web/.next/static    ./apps/web/.next/static
COPY --from=web-build --chown=root:root /workspace/apps/web/public           ./apps/web/public
USER node
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
