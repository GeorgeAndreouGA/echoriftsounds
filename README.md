# EchoRiftSounds

Self-hosted audio library and streaming site. Long-form audio (multi-hour mixes) is served over HTTP Range from disk, with a CRT-terminal-themed web UI and an admin panel for publishing / scheduling tracks. Built on a monorepo with layered security and defense-in-depth architecture.

---

## Production (Docker Compose)

Update Music Path in docker-compose.yml

Edit the `api` service `volumes` section to point to your host music directory:

```yaml
api:
  # ... other config ...
  volumes:
    - echorift-data:/app/data
    - "/mnt/disk_0/MyFatNas/Music/Armin van buuren/Asot/my mix:/app/music:ro"
```

Replace the path with your actual music directory. The `:ro` suffix ensures the volume is read-only.

```bash
# Copy environment template
cp env.example .env
# Edit .env with your settings

# Build and start all containers

docker-compose build --no-cache && docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f api
docker-compose logs -f web
docker-compose logs -f caddy


```

```

```

- **Public site:** `http://localhost:8087`
- **Admin panel:** `http://localhost:9000`
- **API docs:** `http://localhost:9000/api/docs` (requires `SWAGGER_ENABLED=true`)

Expected output:

```
NAME                    STATUS
echorift-data-init      Exited 0          (one-shot, completed)
echorift-api            Up (healthy)
echorift-web            Up
echorift-caddy          Up (healthy)
```

### Containers

#### 1. **data-init** (Alpine 3) — Initialization

- **Purpose:** One-shot setup task that runs before the API starts
- **Role:** Creates `/app/data` and `/app/data/peaks` directories and fixes ownership
- **Why?** Freshly-created named volumes are owned by `root:root`, which would block the API container (uid `1000`) from writing JSON files. This service fixes it once.
- **Idempotent:** Safe to re-run on every `docker-compose up`
- **Network:** `none` (isolated, no network access needed)
- **Restarts:** `no` (runs once and exits successfully)

```dockerfile
FROM alpine:3
USER root
COMMAND: mkdir -p /data/peaks && chown -R 1000:1000 /data && chmod 755 /data /data/peaks
```

#### 2. **api** (Node.js 22 Alpine) — Backend

- **Purpose:** NestJS REST API + HTTP music streaming
- **Ports (internal):** `3001`
- **Key dependencies:** ffmpeg, ffprobe (installed in image)
- **User:** `1000:1000` (non-root)
- **Security:** Read-only filesystem, no capabilities, `no-new-privileges`
- **Volumes:**
  - `/app/data` — JSON state (published.json, scheduled.json)
  - `/app/music` — RO bind-mount to audio files
  - `/app/data/peaks` — ffmpeg peak cache
  - `/tmp` — tmpfs (ephemeral)
- **Resources:** CPU limit 2.5 cores (multi-threaded ffmpeg), 512MB RAM
- **Environment:** TZ, ADMIN_IPS, ADMIN_PASSWORD, SWAGGER_ENABLED, etc. (from `.env`)

```dockerfile
FROM node:22-alpine
RUN apk add --no-cache ffmpeg  # Peak generation tool
COPY --from=api-build node_modules dist ./
USER nodejs  # uid 1000
CMD ["node", "dist/main.js"]
```

#### 3. **web** (Node.js 22 Alpine) — Frontend

- **Purpose:** Next.js app (public site + admin panel)
- **Ports (internal):** `3000`
- **User:** `1000:1000` (non-root)
- **Security:** Read-only filesystem, no capabilities, `no-new-privileges`
- **Volumes:**
  - `/app/.next` — Next.js build output
  - `/app/public` — Static assets
  - `/tmp` — tmpfs (ephemeral)
- **Resources:** CPU limit 1 core, 256MB RAM
- **Build args:** `API_INTERNAL_URL=http://api:3001` (for internal API calls)

```dockerfile
FROM node:22-alpine
COPY --from=web-build .next/standalone ./
COPY --from=web-build .next/static ./apps/web/.next/static
USER nodejs
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "apps/web/server.js"]
```

#### 4. **caddy** (Caddy 2.8 Alpine) — Reverse Proxy

- **Purpose:** Route traffic between containers, block unauthorized endpoints, health checks
- **Ports (exposed to host):**
  - `127.0.0.1:8087:8080` — Public listener (behind host nginx)
  - `127.0.0.1:9000:9000` — Admin listener (behind host nginx)
- **Config:** `/etc/caddy/Caddyfile` (mounted from `./caddy/Caddyfile`)
- **Security:** Minimal capabilities, read-only filesystem
- **Volumes:**
  - `caddy-data` — TLS certificates (if not using external termination)
  - `caddy-config` — Caddy metrics/config state
- **Healthcheck:** `GET http://127.0.0.1:9000/healthz`
- **Resources:** CPU limit 0.5 cores, 64MB RAM

**Caddyfile Routing:**

```
Public Listener (:8080)
  ├─ /admin/* → 404 (blocked)
  ├─ /api/admin/* → 404 (blocked)
  ├─ /api/docs* → 404 (blocked)
  ├─ /api/* → api:3001
  ├─ /music/* → api:3001 (with flush_interval=-1, zero timeouts for long streams)
  └─ /* → web:3000 (Next.js)

Admin Listener (:9000)
  ├─ / → 302 /admin (redirect root)
  ├─ /api/* → api:3001
  ├─ /music/* → api:3001
  └─ /* → web:3000
```

**Special handling for `/music/*`:**

- `flush_interval -1`: Disables Caddy buffering; bytes leave immediately as the API sends them
- `write_timeout 0`: Allows multi-hour downloads to complete without timeout
- `read_timeout 0`: Allows idle sockets between HTTP Range requests
- `header_up -Accept-Encoding`: Strips Accept-Encoding to prevent upstream gzip (audio is incompressible)

### Networking

**Network Name:** `echoriftsounds-network` (bridge)

```
┌─────────────────────────────────────────┐
│  echoriftsounds-network (docker bridge) │
├─────────────────────────────────────────┤
│                                         │
│  data-init (no network)                 │
│  api:3001                               │
│  web:3000                               │
│  caddy:8080, :9000                      │
│                                         │
└─────────────────────────────────────────┘
```

**Communication Flow:**

1. **Host to Container:** Only Caddy's ports are exposed (`:8087`, `:9000`) → host receives at `127.0.0.1` (loopback)
2. **Container to Container:** Uses internal DNS names (e.g., `api:3001`, `web:3000`)
3. **API to Web:** Caddy routes requests; they don't talk directly
4. **No Binding to Host:** API and web containers don't expose any ports to the host—all traffic flows through Caddy

**Dependency Order:**

```
data-init (runs once, no dependencies)
    ↓
api (depends_on: data-init)
    ↓
web (depends_on: api)
    ↓
caddy (depends_on: api, web)
```

### Volumes

| Volume Name                       | Mount Point               | Purpose                                                       | Owner     | Mode | Persists |
| --------------------------------- | ------------------------- | ------------------------------------------------------------- | --------- | ---- | -------- |
| `caddy-data`                    | `/data` (Caddy)         | TLS certs, acme.json                                          | caddy     | rw   | Yes      |
| `caddy-config`                  | `/config` (Caddy)       | Caddy metrics, state                                          | caddy     | rw   | Yes      |
| **`echorift-data`**       | `/app/data` (api)       | published.json, scheduled.json JSON files                     | 1000:1000 | rw   | Yes      |
| **`echorift-data/peaks`** | `/app/data/peaks` (api) | Waveform peak JSON files (one per published track)            | 1000:1000 | rw   | Yes      |
| `/mnt/disk_0/.../Music/...`     | `/app/music` (api)      | Audio files (host bind-mount) — change in docker-compose.yml | —        | ro   | RO       |
| tmpfs                             | `/tmp` (api, web)       | Ephemeral files, ffmpeg scratch                               | —        | rw   | No       |

**Named Volumes vs. Bind Mounts:**

- **Named volumes** (`echorift-data`, `caddy-data`, `caddy-config`): Managed by Docker, persisted on host, can be backed up
- **Bind mount** (`/app/music`): Direct filesystem reference on host; you manage permissions manually

**Peaks Volume Details:**

The `/app/data/peaks` directory stores JSON waveform files for published tracks. Each file is named with a SHA1 hash of the track filename (e.g., `a1b2c3d4....json`). These are generated automatically when a track is published via the admin panel and contain peak amplitude data (one value per second) used by the frontend waveform player. The frontend fetches peaks from `GET /api/tracks/{file}/peaks` to display the waveform without decoding the full audio file in the browser.

---

## Technology Stack

| Layer              | Technology                                  | Purpose                                                 |
| ------------------ | ------------------------------------------- | ------------------------------------------------------- |
| **Monorepo** | pnpm workspaces                             | Package management and workspace linking                |
| **Backend**  | NestJS 11 (TypeScript)                      | REST API, music streaming, admin endpoints              |
| **Frontend** | Next.js 15 + React 19 + Tailwind 4          | Public site, admin panel, responsive UI                 |
| **Storage**  | JSON files on disk                          | Tracks list, schedules, published tracks (no database)  |
| **Audio**    | ffmpeg (backend) + wavesurfer.js (frontend) | Peak generation for waveform visualization              |
| **Proxy**    | Caddy 2.8 (in Docker)                       | Reverse proxy with routing and health checks            |
| **Host TLS** | nginx (optional)                            | External HTTPS termination (recommended for production) |
| **Runtime**  | Node.js 22 (Alpine)                         | Minimal container images for prod                       |

---

## Architecture Overview

EchoRiftSounds uses **layered defense-in-depth** with two completely separate ingress paths:

### Network Diagram

```
       Internet / LAN                          Admin access only
            │                                           │
    Domain :443                                         │
            ▼                                           ▼
   ┌──────────────────────┐          ┌──────────────────────────┐
   │  nginx :443 (public) │          │  nginx :9443 (admin)     │
   │  TLS + sec headers   │          │  TLS + IP whitelist      │
   │  Let's Encrypt       │          │  + brute-force caps      │
   └──────────┬───────────┘          │  (host-restricted)       │
              │                       └──────────────┬───────────┘
              ▼                                      ▼
   ┌──────────────────────┐          ┌──────────────────────────┐
   │ Caddy :8087→:8080    │          │ Caddy :9000              │
   │ (in docker network)  │          │ (private port)           │
   │                      │          │                          │
   │ Blocks:              │          │ Allows:                  │
   │ • /admin/*           │          │ • Everything             │
   │ • /api/admin/*       │          │ • / → /admin redirect    │
   │ • /api/docs*         │          │                          │
   └──────────┬───────────┘          └──────────────┬───────────┘
              │                                      │
              └───────────────┬──────────────────────┘
                              │
                   Docker Network (bridge)
                             │
                ┌────────────┬─────────────┐
                ▼            ▼             ▼
           ┌─────────┐  ┌──────────┐  ┌────────────┐
           │  web    │  │   api    │  │   caddy    │
           │ :3000   │  │  :3001   │  │  :8080     │
           │ Next.js │  │ NestJS   │  │  :9000     │
           └────┬────┘  └────┬─────┘  └──────────┘
                │             │
                │      ┌──────┴──────┬──────────┐
                │      ▼             ▼          ▼
           echorift-data      /app/music    /app/data/peaks
           (JSON state)       (RO mount)    (peak cache)
```

### Security Layers

1. **Internet Layer:** nginx handles external TLS, HTTPS redirects, and brute-force rate limiting
2. **Container Proxy:** Caddy enforces role-based routing (public vs. admin)
3. **Application Layer:** NestJS guards validate IP allowlists and session/CSRF tokens
4. **Network Isolation:** API and web never bind to host; only Caddy's ports exposed
5. **Admin Access Layer:** The admin listener is restricted by host network rules, loopback binding, and API allowlists.

**Why separate admin TLS?** Public TLS (`:443`) and admin TLS (`:9443`) use independent certs, so a misconfigured public vhost cannot accidentally serve admin content. Admin cert can be self-signed or provided by your own internal PKI and should be trusted only by authorized devices.

**Why IP allowlist in the API?** Defense in depth. If a neighbor container is compromised, `IpWhitelistGuard` is the last fence before the API accepts requests.

---

## Project Structure

```
echoriftsounds/
├── apps/
│   ├── api/                              NestJS backend
│   │   ├── src/
│   │   │   ├── main.ts                   Application entry point
│   │   │   ├── app.module.ts             Main module with imports
│   │   │   ├── admin/                    Admin endpoints & auth
│   │   │   │   ├── admin.controller.ts   POST /api/admin/* handlers
│   │   │   │   ├── admin.service.ts      Publish/schedule logic
│   │   │   │   └── admin.module.ts
│   │   │   ├── tracks/                   Public music endpoints
│   │   │   │   ├── tracks.controller.ts  GET /api/tracks handlers
│   │   │   │   ├── tracks.service.ts     Track listing
│   │   │   │   ├── peaks.controller.ts   Waveform peak data
│   │   │   │   ├── peaks.service.ts      Peak generation (ffmpeg)
│   │   │   │   ├── backfill-peaks.ts     Peak backfill utility
│   │   │   │   └── tracks.module.ts
│   │   │   ├── scheduler/                Background jobs
│   │   │   │   ├── scheduler.service.ts  30s cron (promote scheduled)
│   │   │   │   └── scheduler.module.ts
│   │   │   ├── storage/                  JSON persistence
│   │   │   │   ├── storage.service.ts    Read/write JSON files
│   │   │   │   ├── json-store.ts         File locking, atomic writes
│   │   │   │   └── storage.module.ts
│   │   │   └── auth/                     Guards & decorators
│   │   │       ├── basic-auth.guard.ts   Username/password validation
│   │   │       ├── session.guard.ts      Session cookie check
│   │   │       ├── ip-whitelist.guard.ts IP allowlist enforcement
│   │   │       ├── csrf.ts               CSRF token generation/verify
│   │   │       ├── throttler.guard.ts    Rate limiting
│   │   │       └── public.decorator.ts   @Public() skip auth
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── tsconfig.build.json
│   │
│   └── web/                              Next.js frontend
│       ├── app/
│       │   ├── layout.tsx                Root layout with providers
│       │   ├── page.tsx                  Public homepage
│       │   ├── providers.tsx             React context setup
│       │   └── admin/
│       │       ├── page.tsx              Admin dashboard
│       │       └── AdminClient.tsx       Admin page (client-side)
│       ├── components/
│       │   ├── WaveformPlayer.tsx        Audio player with waveform
│       │   ├── WaveformPlayerInner.tsx   wavesurfer.js integration
│       │   ├── TrackCard.tsx             Track display card
│       │   ├── TrackListPage.tsx         Track list container
│       │   ├── AdminPublishForm.tsx      Form to publish tracks
│       │   ├── AdminScheduledList.tsx    Scheduled tracks view
│       │   ├── AdminPublishedList.tsx    Published tracks view
│       │   ├── AdminPeaksProgress.tsx    Peak generation progress
│       │   ├── CrtScheduler.tsx          Schedule picker UI
│       │   ├── LoginForm.tsx             Admin password entry
│       │   ├── ScheduleModal.tsx         Schedule confirmation modal
│       │   ├── SearchBox.tsx             Track search input
│       │   ├── Countdown.tsx             Timer display
│       │   ├── CrtCheckbox.tsx           Custom checkbox
│       │   ├── chrome/
│       │   │   ├── CrtShell.tsx          CRT terminal styling wrapper
│       │   │   ├── BootSequence.tsx      Boot animation
│       │   │   └── WindowChrome.tsx      Window frame decoration
│       │   ├── hero/
│       │   │   └── Hero.tsx              Landing page hero section
│       │   └── motion/
│       │       └── glitch.ts             Glitch animation utilities
│       ├── hooks/
│       │   ├── useAdminAuth.ts           Admin session management
│       │   ├── useCsrf.ts                CSRF token fetching
│       │   ├── useIdleLogout.ts          Auto-logout on idle
│       │   └── useCoarsePointer.ts       Touch device detection
│       ├── lib/
│       │   ├── api.ts                    API client functions
│       │   ├── activeTrack.tsx           Audio player context
│       │   ├── useFillAnimation.ts       Progress bar animation
│       │   └── useCoarsePointer.ts       pointer-coarse detection
│       ├── styles/
│       │   └── globals.css               Tailwind + custom CSS
│       ├── public/
│       │   └── manifest.webmanifest      PWA manifest
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.ts
│       ├── postcss.config.mjs
│       └── middleware.ts                 Next.js request middleware
│
├── packages/
│   └── shared/                           Shared types & schemas
│       ├── src/
│       │   └── index.ts                  Export types, Zod schemas
│       ├── package.json
│       └── tsconfig.json
│
├── caddy/
│   └── Caddyfile                         Reverse proxy config (2 listeners)
│
├── docker-compose.yml                    Production deployment manifest
├── Dockerfile                            Multi-stage build (api + web)
├── host_nginx.conf                       Optional host-level reverse proxy
├── env.example                           Environment variable template
├── pnpm-workspace.yaml                   Workspace configuration
├── package.json                          Root package.json
├── pnpm-lock.yaml                        Lock file
├── tsconfig.base.json                    Base TypeScript config
├── eslint.config.mjs                     ESLint configuration
└── README.md                             This file
```

---

#### Configure Reverse Proxy (Host TLS)

##### nginx (Recommended for multi-domain setups)

Use the provided `host_nginx.conf` as a template:

```bash
sudo cp host_nginx.conf /etc/nginx/sites-available/echorift
sudo ln -s /etc/nginx/sites-available/echorift /etc/nginx/sites-enabled/echorift
sudo certbot certonly --webroot -w /var/www/certbot -d echorift.example.com
sudo systemctl reload nginx
```

The config will:

- Redirect HTTP → HTTPS
- Proxy public traffic to `127.0.0.1:8087` (Caddy public)
- Proxy admin traffic to `127.0.0.1:9000` (Caddy admin, locally restricted)
- Apply SSL/TLS with Let's Encrypt certs

---

## Security Model

### Defense-in-Depth Layers

1. **Firewall / Access Control (Edge)**

   - Admin listener (`:9000`) is locally restricted by host network policy and loopback binding
   - Public listener (`:8087`) is accessible from internet only when proxied through host nginx with TLS
2. **Host TLS (SSL/TLS)**

   - Public: Let's Encrypt cert at `:443` (handled by nginx)
   - Admin: Self-signed or imported cert at `:9443` (nginx) for dev/test
   - Independent certs mean public misconfiguration can't leak admin paths
3. **Caddy Reverse Proxy (Application Routing)**

   - Public listener (`:8080` → `:8087`) blocks:
     - `/admin/*` (admin panel)
     - `/api/admin/*` (all admin endpoints)
     - `/api/docs*` (Swagger schema)
   - Admin listener (`:9000`) allows everything + redirects `/` to `/admin`
4. **NestJS Guards (Request Validation)**

   - `IpWhitelistGuard`: Validates `X-Forwarded-For` header against `ADMIN_IPS` env var
   - `BasicAuthGuard`: Validates username/password (currently `admin` / `ADMIN_PASSWORD`)
   - `SessionGuard`: Validates session cookie after login
   - `CsrfGuard`: Validates CSRF tokens for state-changing operations
   - `ThrottlerGuard`: Rate-limits requests (login endpoint especially)
5. **Filesystem (OS-level)**

   - Containers run as non-root user (uid `1000` / `1001`)
   - Filesystems are read-only except for `/tmp` and `/app/data`
   - Music files are mounted read-only (`:ro`)
   - No Linux capabilities (`cap_drop: ALL`), no privilege escalation (`no-new-privileges: true`)
