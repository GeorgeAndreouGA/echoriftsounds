# EchoRiftSounds

Self-hosted audio library and streaming site for long-form audio (multi-hour DJ mixes and sets). Tracks stream straight from disk over HTTP Range — so seeking and multi-hour playback work on a single connection — behind a CRT-terminal-themed web UI. An IP-restricted admin panel publishes, schedules, and manages the library.

The whole app is served under a configurable URL subpath (default **`/music`**), so it can live at `https://your-domain.com/music` alongside other apps on the same domain.

## What it does

- **Public site** (`/music`) — browse and play published tracks in a retro CRT interface, with waveform scrubbing (wavesurfer.js) and direct download.
- **Audio streaming** (`/music/audio/<file>`) — served from disk with HTTP Range support, immutable caching, and long keep-alive for multi-hour single-socket playback/downloads.
- **Waveforms** — `ffmpeg` pre-computes per-second peaks server-side so the browser renders waveforms without decoding whole files. Generation progress streams live to the admin panel over SSE.
- **Admin panel** (`/music/admin`) — log in to publish/unpublish tracks, schedule tracks to go live later, cancel peak jobs, and watch peak-generation progress. IP-allowlisted.
- **Scheduler** — a cron promotes scheduled tracks to published every 30 seconds.
- **No database** — state is plain JSON files on disk (`published.json`, `scheduled.json`); the music library is a read-only bind mount.

## Stack

- **Monorepo:** pnpm workspaces (`apps/api`, `apps/web`, `packages/shared`)
- **Backend:** NestJS 11 (TypeScript) — internal port `3001`
- **Frontend:** Next.js 15 + React 19 + Tailwind 4 — internal port `3000`
- **Audio tooling:** `ffmpeg` (peak generation), `wavesurfer.js` (rendering)
- **Reverse proxy:** Caddy (in-compose), behind an optional host nginx for TLS

## Running with Docker

Everything runs as containers via Docker Compose. Only Caddy publishes to the host (bound to loopback); `api` and `web` stay on the internal docker network.

```bash
docker compose up --build -d
```

| Service     | Internal port | Host binding       | Role                                     |
|-------------|---------------|--------------------|------------------------------------------|
| `data-init` | —             | —                  | One-shot: chowns + tightens the data volume (700/600), exits |
| `api`       | 3001          | — (network only)   | NestJS — REST API + audio streaming      |
| `web`       | 3000          | — (network only)   | Next.js — public site + admin UI         |
| `caddy`     | 8080          | `127.0.0.1:8087`   | Reverse proxy (single port)              |

Caddy routes by path: `/music/api/*`, `/music/audio/*` and `/music/stream/*` → `api`, everything else under `/music` → `web`. Swagger (`/music/api/docs`) is blocked at the edge.

### Optional host reverse proxy (TLS)

For a public HTTPS domain, put a host-level reverse proxy (nginx in the example
below) in front to terminate TLS and forward to Caddy on `127.0.0.1:8087`.

**Five location blocks are needed:** two for audio streaming, two to restrict
the admin surface, and one catch-all. Order in the file does not matter — for
prefix locations nginx picks the *longest* match, so every specific block below
wins over the catch-all `/music`.

Long-form audio is the whole reason this config is not the default one: a
2-hour track is a single multi-hundred-megabyte response served over Range
requests, so buffering must be off and the timeouts must be hours, not seconds.

Two prerequisites go at `http{}` level, outside any `server{}` block:

```nginx
# ── The upstream every location below proxies to ──
# Caddy publishes 127.0.0.1:8087 (host) → :8080 (container). Loopback only,
# so it is never reachable from off-box.
#
# Note the scheme is http, NOT https: the Caddyfile sets `auto_https off`
# because TLS terminates here at nginx. Pointing proxy_pass at https:// will
# fail the handshake — the hop is plaintext over loopback by design.
upstream caddy_public {
    server 127.0.0.1:8087;
    keepalive 32;
}

# ── WebSocket/SSE upgrade map ──
# Required so `Connection: upgrade` flows through untouched.
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

Then, inside the TLS `server{}` block:

```nginx
# ── Original audio files — public, Range requests, up to ~1 GB ──
location /music/audio/ {
    proxy_pass              http://caddy_public;
    proxy_buffering         off;
    proxy_request_buffering off;
    proxy_read_timeout      1h;
    proxy_send_timeout      1h;
    proxy_http_version      1.1;
    proxy_set_header        Host              $host;
    proxy_set_header        X-Real-IP         $remote_addr;
    proxy_set_header        X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header        X-Forwarded-Proto $scheme;
    proxy_set_header        X-Forwarded-Host  $host;
    proxy_set_header        X-Internal-Listener "";
    proxy_set_header        Connection        "";
}

# ── Compressed AAC playback proxies — same streaming rules as /audio ──
# Easy to miss: this is what the player requests FIRST for every track, and it
# only falls back to /music/audio/ when the .m4a is absent. Leave this block
# out and every seek on a proxied track goes through the buffered catch-all.
location /music/stream/ {
    proxy_pass              http://caddy_public;
    proxy_buffering         off;
    proxy_request_buffering off;
    proxy_read_timeout      1h;
    proxy_send_timeout      1h;
    proxy_http_version      1.1;
    proxy_set_header        Host              $host;
    proxy_set_header        X-Real-IP         $remote_addr;
    proxy_set_header        X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header        X-Forwarded-Proto $scheme;
    proxy_set_header        X-Forwarded-Host  $host;
    proxy_set_header        X-Internal-Listener "";
    proxy_set_header        Connection        "";
}

# ── Admin panel UI — RESTRICTED ──
# Serves the admin page itself. Without this block the panel HTML is reachable
# by anyone (the data behind it is still IP-gated, but there is no reason to
# publish the login form to the internet).
location /music/admin {
    allow 192.168.1.0/24;      # your LAN
    allow 100.64.0.0/10;       # tailnet, if you use one
    deny  all;

    proxy_pass              http://caddy_public;
    proxy_buffering         off;
    proxy_request_buffering off;
    proxy_read_timeout      1h;
    proxy_send_timeout      1h;
    proxy_http_version      1.1;
    proxy_set_header        Host              $host;
    proxy_set_header        X-Real-IP         $remote_addr;
    proxy_set_header        X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header        X-Forwarded-Proto $scheme;
    proxy_set_header        X-Forwarded-Host  $host;
    proxy_set_header        Upgrade           $http_upgrade;
    proxy_set_header        Connection        $connection_upgrade;
    proxy_set_header        X-Internal-Listener "";
}

# ── Admin API — RESTRICTED ──
# Covers ALL 18 admin routes in one prefix, including login, logout, csrf, and
# the peaks-progress SSE stream. Keep proxy_buffering off here: the progress
# panel is SSE and shows nothing at all if it is buffered.
location /music/api/admin/ {
    allow 192.168.1.0/24;
    allow 100.64.0.0/10;
    deny  all;

    proxy_pass              http://caddy_public;
    proxy_buffering         off;
    proxy_request_buffering off;
    proxy_read_timeout      1h;
    proxy_send_timeout      1h;
    proxy_http_version      1.1;
    proxy_set_header        Host              $host;
    proxy_set_header        X-Real-IP         $remote_addr;
    proxy_set_header        X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header        X-Forwarded-Proto $scheme;
    proxy_set_header        X-Forwarded-Host  $host;
    proxy_set_header        Upgrade           $http_upgrade;
    proxy_set_header        Connection        $connection_upgrade;
    proxy_set_header        X-Internal-Listener "";
}

# ── Everything else: site, public API, SSE ──
location /music {
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Content-Type-Options    "nosniff" always;
    add_header Referrer-Policy           "same-origin" always;
    add_header X-Frame-Options           "DENY" always;

    proxy_pass              http://caddy_public;
    proxy_buffering         off;
    proxy_request_buffering off;
    proxy_read_timeout      1h;
    proxy_send_timeout      1h;
    proxy_http_version      1.1;
    proxy_set_header        Host              $host;
    proxy_set_header        X-Real-IP         $remote_addr;
    proxy_set_header        X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header        X-Forwarded-Proto $scheme;
    proxy_set_header        X-Forwarded-Host  $host;
    proxy_set_header        Upgrade           $http_upgrade;
    proxy_set_header        Connection        $connection_upgrade;
    proxy_set_header        X-Internal-Listener "";
}
```

#### Restricting the admin surface

Two prefixes cover the entire admin surface, and nothing else needs restricting:

| Prefix | What it is |
|---|---|
| `/music/admin` | The admin panel page (Next.js) |
| `/music/api/admin/` | All 18 admin API routes — `login`, `logout`, `csrf`, `files`, `publish`, `delete`, `scheduled`, `scheduled/delete`, `published`, `peaks/cancel`, `peaks-progress` (SSE), `categories` (list/create/rename/delete), `tracks/category`, `tracks/reorder` |

`/music/api/docs` (Swagger) is a third admin-ish surface, but it is already
answered with a 404 by Caddy, so it needs nothing here.

**Do not block these** — the public site stops working without them:
`/music/api/tracks`, `/music/api/tracks/:file/peaks`, `/music/api/tracks/stream`,
`/music/api/categories` (read-only; the writes live under `/music/api/admin/`),
`/music/audio/`, `/music/stream/`.

This is defence in depth, not the only gate. `IpWhitelistGuard` already checks
`ADMIN_IPS` at the application layer, and it fails closed in production if the
list is empty. The nginx `allow`/`deny all` puts a second, earlier gate in front
so unauthorised requests never reach the app at all — but keep `ADMIN_IPS`
populated regardless, since it is what protects you if the proxy is ever
bypassed or misconfigured.

#### Four things that silently break

- **`location` blocks do not inherit from each other.** Adding an `allow`/`deny`
  block without also repeating the full `proxy_pass` + `proxy_set_header` set
  will not "add a restriction to the catch-all" — it *replaces* it, and nginx
  will try to serve the admin panel from the filesystem and return 404. This is
  the single most common way this change goes wrong.
- **Check what `$remote_addr` actually contains.** If nginx sits behind
  Cloudflare Tunnel, Tailscale, or any other upstream proxy, `$remote_addr` is
  the *tunnel's* address, not the visitor's — so `allow`/`deny` silently
  matches the wrong thing and either locks you out or lets everyone in. In that
  case set `set_real_ip_from <upstream>;` and `real_ip_header X-Forwarded-For;`
  first, and confirm with `curl -sI https://your-domain.com/music/admin` from
  outside that you get `403`.
- **`proxy_buffering off` is not optional on the admin or catch-all blocks.**
  Two endpoints are Server-Sent Events — `/music/api/tracks/stream` (public,
  drives live list updates) and `/music/api/admin/peaks-progress` (the media
  processing panel). Buffered, both appear to connect and then deliver nothing.
- **Do not set `proxy_set_header Accept-Encoding "";`.** Caddy compresses the
  waveform JSON (123 KB → 26 KB on a 2-hour track); stripping the header on the
  way in disables that and every listener pays the full size.

One deliberate trade-off: `upstream … { keepalive 32; }` only takes effect where
`Connection` is passed as `""`. The two audio blocks do that, so multi-hour
streams reuse upstream connections. The admin and catch-all blocks send
`Connection $connection_upgrade` instead, which resolves to `close` for ordinary
requests — that costs a little connection churn on page loads but is what keeps
the SSE upgrade path working. Correct as written; don't "optimise" it away.

`X-Forwarded-For` matters beyond logging: `IpWhitelistGuard` reads the real
client IP from it, so admin access fails closed without it.

After editing, reload:

```bash
sudo nginx -t && sudo nginx -s reload
```

Public site: `https://your-domain.com/music`

## Subpath configuration

The app is mounted under `BASE_PATH` (default `/music`) — the single source of truth, set in `.env`:

```
BASE_PATH=/music     # leading slash, no trailing slash; empty = served at the domain root
```

`BASE_PATH` is consumed by the web build (Next.js `basePath`), the API (route / static / cookie prefixes), and the Caddyfile. **It is baked into the web image at build time**, so after changing it you must rebuild:

```bash
docker compose build web && docker compose up -d
```

The host reverse proxy hardcodes the `/music` paths — update all three `location` blocks above (`/music/audio/`, `/music/stream/`, `/music`) if you change `BASE_PATH`.

## URLs / routes

| Path | Purpose |
|------|---------|
| `/music` | Public site (home) |
| `/music/admin` | Admin panel — restrict at the proxy; data is IP-gated regardless |
| `/music/api/tracks` | Public — list of published tracks |
| `/music/api/categories` | Public — category names for the list tabs (read-only) |
| `/music/api/tracks/:file/peaks` | Public — waveform peaks (`202` while generating) |
| `/music/audio/:file` | Public — original file, streaming / download |
| `/music/stream/:file.m4a` | Public — compressed AAC playback proxy (absent when the source is already small enough to serve directly) |
| `/music/api/tracks/stream` | Public — SSE, live track/category changes |
| `/music/api/admin/peaks-progress` | Admin — SSE, media processing progress |
| `/music/api/admin/*` | Admin API (18 routes) — IP-allowlisted + session + CSRF |
| `/music/api/docs` | Swagger — blocked at the edge (404) |

## Common Docker commands

```bash
# Bring up the full stack (rebuild changed images, run detached).
docker compose up --build -d

# Tail logs from one service (Ctrl-C exits, container keeps running).
docker compose logs -f api
docker compose logs -f caddy

# Restart a single service after a config-only change.
# Caddy's admin API is disabled (`admin off` in the Caddyfile globals),
# so `caddy reload` won't work — restart the container instead.
docker compose restart caddy

# Rebuild + replace a single service after a code change.
docker compose up --build api -d

# Open a shell in a running container for poking around.
docker compose exec api sh

# Inspect status and ports.
docker compose ps

# Stop everything (containers only — bind-mounted data and volumes persist).
docker compose down

# Tear down and also remove the named volumes (caddy-data, caddy-config, echorift-data).
# Bind-mounted music source is NOT touched.
docker compose down -v
```

## Environment variables

Defined in `.env` at the repo root (loaded via `env_file` in `docker-compose.yml`). See `env.example` for a template.

| Variable | Purpose |
|----------|---------|
| `BASE_PATH` | URL subpath the whole app is served under (e.g. `/music`). Empty = domain root. **Build-time** for the web image. |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` | Admin login credentials. Hash the password with bcrypt (cost 12). |
| `ADMIN_IPS` | Comma-separated CIDR/IP allowlist for admin endpoints (`IpWhitelistGuard`). |
| `COOKIE_SECRET` | Signs session + CSRF cookies. Required; rotate to invalidate all sessions. |
| `WEB_ORIGIN` | CORS origin for the API. |
| `API_INTERNAL_URL` | Server-side URL the web app uses to reach the API (`http://api:3001` in compose). |
| `SWAGGER_ENABLED` | `true` mounts Swagger UI at `/music/api/docs`. Default off — keep off in production. |
| `SITE_NAME` / `YOUTUBE_URL` / `INSTAGRAM_URL` / `FACEBOOK_URL` | Branding + footer links. |

### Generating the secrets

Both commands run inside the API image, so there is nothing to install on the
host — the app's own `bcryptjs` does the hashing, which guarantees the hash
matches what `bcrypt.compare` will verify against at login.

**`ADMIN_PASSWORD_HASH`** — bcrypt, cost 12. Replace the password, then paste
the whole `$2a$12$…` string into `.env`:

```bash
docker compose run --rm --no-deps --entrypoint node api \
  -e "console.log(require('bcryptjs').hashSync('your-password-here', 12))"
# → $2a$12$JFm.hC3vvdHylAZws/4ooOZVWndj2t4uqTwn2vzSO4NAwlaQDHYHS
```

Typing the password as a shell argument leaves it in your shell history. To
avoid that, prefix the command with a space (if your shell honours
`HISTCONTROL=ignorespace`), or clear the entry afterwards.

**`COOKIE_SECRET`** — 32 random bytes, hex. Any high-entropy string works:

```bash
docker compose run --rm --no-deps --entrypoint node api \
  -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# → 61502ce2989a778e003b00e7280487a737c18352ced726195b778a37d6a6c9bc
```

`openssl rand -hex 32` produces an equivalent value if you would rather not go
through Docker.

Then apply them:

```bash
docker compose up -d api      # picks up the new .env
```

Three things worth knowing:

- **A missing `COOKIE_SECRET` is not a startup error.** The API falls back to a
  random secret generated at boot, so everything *appears* to work — until you
  restart, when every session and CSRF token silently becomes invalid and admins
  are logged out. Set it explicitly.
- **Rotating `COOKIE_SECRET` invalidates all sessions immediately.** That is the
  intended way to force everyone out.
- **Do not escape the `$` characters in the bcrypt hash.** `.env` is read via
  `env_file:`, whose values are taken literally, so the hash goes in exactly as
  printed. The `$$` doubling you will see in `stress/docker-compose.stress.yml`
  is only needed because that file sets the value inline under `environment:`,
  where Compose performs variable interpolation.

> Storage paths (`/app/data`, `/app/music`) are baked into the image and the bind mounts in `docker-compose.yml`. To point at a different music source, edit the `volumes:` entry under the `api` service.

## Security

Admin access is gated at the application layer, so it holds no matter how a request reaches the API:

- **IP allowlist** — `IpWhitelistGuard` checks the real client IP (from `X-Forwarded-For`) against `ADMIN_IPS`; fails closed in production if the list is empty.
- **Perimeter allowlist (recommended)** — restrict `/music/admin` and `/music/api/admin/` at the host reverse proxy with `allow` / `deny all` so unauthorised requests never reach the app. See [Restricting the admin surface](#restricting-the-admin-surface).
- **Session** — `POST /music/api/admin/login` (bcrypt) sets a `httpOnly`, `signed`, `sameSite=strict` cookie scoped to `/music/api/admin`; the `Secure` flag is derived from `req.secure`. The cookie carries a **random server-side session id**, not a constant — `logout` revokes it immediately, and a container restart drops all sessions.
- **CSRF** — a token in the `csrf-token` header is required for unsafe admin methods.
- **Input validation** — every admin request body is validated against a DTO by a global `ValidationPipe` (`whitelist` + `forbidNonWhitelisted`), so unexpected properties are rejected rather than persisted to the JSON stores.
- **Embargo** — `/music/audio/<file>`, `/music/stream/<file>.m4a` and `/music/api/tracks/:file/peaks` serve **published tracks only**. An unpublished, scheduled-but-unreleased, or unknown filename returns `404`, so a scheduled release can't be fetched early by guessing names.
- **Rate limiting** — 100 req/min globally; the login endpoint is capped at 5 attempts per 5 minutes with a deterministic `Retry-After`. Host nginx adds a 10 r/min perimeter cap on the login route.
- **CSP** — strict, via Helmet plus a per-request nonce in Next.js middleware (covers the homepage and every route).
- **Boot check** — the API refuses to start in production if `COOKIE_SECRET` is unset, rather than falling back to a random per-boot secret.
- **Swagger** is blocked at the Caddy edge (`/api/docs`, `/api/docs-json`, `/api/docs-yaml`), so the schema can't leak even if `SWAGGER_ENABLED` is left on.

### $\color{red}{\textsf{Container hardening (The Golden Rule)}}$

Every container ships the same locked-down posture — treat this as the baseline for any new service too, not a one-off:

- **Non-root, single identity.** `api` and `web` run as uid/gid `1000` (the base image's `node` user); nothing long-running runs as root. `data-init` is the only container that touches root, and only to `chown`/`chmod` the volume before it exits.
- **Read-only root filesystem.** `read_only: true` on every long-running container. The only writable paths are an explicit `tmpfs /tmp` (scratch, never persisted) and the `echorift-data` volume mounted at `/app/data` on the api.
- **Code the app can't modify.** Application code (`dist`, `node_modules`, the Next standalone bundle) is copied `root:root` and only world-readable, so the runtime user can execute it but never rewrite it — a second barrier behind the read-only rootfs.
- $\color{red}{\textbf{Owner-only data.}}$ The data volume is `700` on directories and `600` on files, owned by `1000`; the API sets `umask 077` so everything it writes at runtime (peaks JSON, `.m4a` streams, the JSON stores and their temp files) is created `600`. No other uid can read it.
- **Read-only music.** The music library is a `:ro` bind mount — the app can never write to your source files.
- **No capabilities, no privilege escalation.** `cap_drop: ALL` and `security_opt: no-new-privileges:true` on every container. Caddy re-adds exactly one capability, `NET_BIND_SERVICE`, and nothing else.
- **Bounded resources.** Every container has explicit CPU and memory limits, so a runaway — or an attacker trying to exhaust the box — can't starve the host or its neighbours:

| Service | CPU limit | Memory limit |
|---------|-----------|--------------|
| `api`   | 2.5 cores | 512 MB       |
| `web`   | 1 core    | 256 MB       |
| `caddy` | 0.5 core  | 64 MB        |

(`data-init` is a one-shot and needs no limits.)

Verify the running posture at any time:

```bash
docker exec echorift-api id                                    # uid=1000(node) gid=1000(node)
docker exec echorift-api sh -c 'ls -land /app/dist /app/data'  # dist → root:root, data → drwx------ 1000
docker exec echorift-api sh -c 'touch /app/dist/x'             # → Read-only file system
docker stats --no-stream                                       # live CPU/mem against the limits above
```

## Local development

Run the API and web app directly on the host (no Docker), each on its native port:

```bash
pnpm install
pnpm dev        # runs api (3001) + web (3000) concurrently
```

With `BASE_PATH` empty the app is at `http://localhost:3000`. To exercise the subpath locally, set `BASE_PATH` (API) and `NEXT_PUBLIC_BASE_PATH` (web).

## Scripts

```bash
pnpm build      # build all workspaces
pnpm lint       # lint all workspaces
pnpm dev        # run api + web in watch mode

pnpm --filter @echorift/api dev
pnpm --filter @echorift/web dev
pnpm --filter @echorift/shared build
```

## License

[PolyForm Noncommercial License 1.0.0](LICENSE) — source-available, noncommercial use only.

Copyright (c) 2025 EchoRiftSounds.

You may read, run, modify and share this code for any noncommercial purpose. Commercial use requires a separate license. GitHub displays this as "Other" because its detector does not recognise PolyForm; the SPDX identifier is `PolyForm-Noncommercial-1.0.0`.
