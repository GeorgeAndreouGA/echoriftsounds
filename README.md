# EchoRiftSounds

Self-hosted audio library and streaming site. Long-form audio (multi-hour mixes) is served over HTTP Range from disk, with a CRT-terminal-themed web UI and an admin panel for publishing / scheduling tracks.

## Stack

- **Monorepo:** pnpm workspaces
- **Backend:** NestJS 11 (TypeScript) — internal port `3001`
- **Frontend:** Next.js 15 + React 19 + Tailwind 4 — internal port `3000`
- **Storage:** JSON files on disk (no database). Music files live on a bind-mounted directory and are served read-only.
- **Audio tooling:** `ffmpeg` (waveform peak generation), `wavesurfer.js` (frontend rendering)
- **Reverse proxy:** Caddy (in-compose) behind optional host nginx for TLS

## Architecture

Layered defense-in-depth — two completely separate ingress paths. The public path is internet-facing with TLS; the admin path is **VPN-only** (Tailscale / WireGuard) on a private high port, also with TLS layered on top of the VPN's transport encryption (independent crypto — a misconfigured VPN won't drop admin to plain HTTP). Admin endpoints are blocked at *every* layer of the public path so nothing relies on a single fence. `api` and `web` never bind to the host — all traffic must traverse Caddy.

```
       Internet / LAN                                  VPN (Tailscale / WireGuard)
            │                                                       │
   echorift.example.com :443                                         │
            ▼                                                       ▼
   ┌──────────────────────┐                          ┌──────────────────────────┐
   │  nginx :443 (public) │                          │  nginx :9443 (admin)     │
   │  TLS + sec headers   │                          │  TLS + IP allow          │
   │                      │                          │  + login rate-limit      │
   └──────────┬───────────┘                          │  (firewall: VPN-only)    │
              │                                      └──────────────┬───────────┘
              ▼                                                     ▼
   ┌──────────────────────┐                          ┌──────────────────────────┐
   │ Caddy public  :8087  │                          │ Caddy admin  :9000       │
   │ → :8080 in container │                          │                          │
   │ blocks /admin*       │                          │ forwards everything;     │
   │ blocks /api/admin*   │                          │ root → /admin redirect   │
   │ blocks /api/docs*    │                          │                          │
   └──────────┬───────────┘                          └──────────────┬───────────┘
              │                                                     │
              └─────────────────────────┬───────────────────────────┘
                                        │ docker network only — no host binding
                       ┌────────────────┴───────────────┐
                       ▼                                ▼
                ┌─────────────────┐              ┌─────────────────┐
                │  web  :3000     │              │  api  :3001     │
                │  Next.js        │              │  NestJS         │
                │  public site    │              │  /api/tracks    │
                │  + admin panel  │              │  /api/admin     │
                └─────────────────┘              │  /api/docs      │
                                                 │  /music/*       │
                                                 │  scheduler 30s  │
                                                 └────────┬────────┘
                                                          │
                          ┌───────────────────────────────┼──────────────────┐
                          ▼                               ▼                  ▼
                  /app/data (JSON)               /app/music (RO)     /app/data/peaks
                  published.json                 bind-mounted         ffmpeg cache
                  scheduled.json                 audio source
```

**Why a separate admin port with its own TLS cert?** Public TLS at `:443` and admin TLS at `:9443` are physically separate listeners with separate certs, so a misconfigured public vhost cannot accidentally serve admin paths. The admin cert is either Tailscale-issued (real LE, valid only inside the tailnet) or self-signed (warns once, can be imported into the device trust store). TLS *and* VPN are independent layers — if one fails, the other still encrypts.

**Why does the API still enforce its own IP allowlist?** Defense in depth — nginx only guards the admin vhost. If something reaches `api:3001` from inside the docker network (e.g. a compromised neighbor container), `IpWhitelistGuard` is the last fence.

> **Hardening note:** Caddy's admin listener is published as `9000:9000` in `docker-compose.yml`, which binds to all host interfaces. For VPN-only admin, change this to `"127.0.0.1:9000:9000"` so the only path into Caddy admin is via nginx on `:9443`. (Not changed by default to keep dev probing easy.)

## Layout

```
apps/
  api/                NestJS — REST + static music streaming
    src/
      tracks/         Public endpoints (track list, peaks)
      admin/          Admin endpoints (auth, publish, schedule)
      scheduler/      Cron — promotes scheduled tracks every 30s
      storage/        JSON-file persistence
      auth/           Basic-auth, session, IP-allowlist, CSRF guards
  web/                Next.js — public site + admin panel
packages/
  shared/             Types + Zod schemas shared between api and web
caddy/Caddyfile       In-compose reverse proxy (public + admin listeners)
host_nginx.conf       Optional host-level TLS terminator
docker-compose.yml    Production deployment
```

## Development

Runs the API and web app directly on the host (no Docker, no Caddy in front), so you hit each service on its native port.

```bash
pnpm install
pnpm dev        # runs api (3001) + web (3000) concurrently
```

Visit:
- `http://localhost:3000` — public site
- `http://localhost:3000/admin` — admin panel
- `http://localhost:3001/api/docs` — Swagger UI (requires `SWAGGER_ENABLED=true`)

## Production (Docker Compose)

```bash
docker compose up --build -d
```

Three containers come up; **only Caddy publishes to the host**:

| Service  | Internal port | Host port      | Role                                  |
|----------|---------------|----------------|---------------------------------------|
| `api`    | 3001          | —              | NestJS app (docker network only)      |
| `web`    | 3000          | —              | Next.js app (docker network only)     |
| `caddy`  | 8080, 9000    | **8087, 9000** | Public + admin reverse proxy          |

Plus host nginx (running outside Docker, config in `host_nginx.conf`):

| Listener         | Port | Routed to              | Reachable from       |
|------------------|------|------------------------|----------------------|
| Public (TLS, LE) | 443  | `127.0.0.1:8087` (Caddy public) | Internet            |
| Admin (TLS, self-signed or Tailscale) | 9443 | `127.0.0.1:9000` (Caddy admin)  | **VPN interface only** |
| HTTP redirect    | 80   | → 443                  | Internet            |

Reachable URLs:
- `https://echorift.example.com` — public site (admin paths and `/api/docs*` blocked at the proxy)
- `https://<vpn-host>:9443/admin` — admin panel, only over Tailscale / WireGuard

Before nginx will start, the admin cert and key must exist at the paths declared in `host_nginx.conf` (`/etc/nginx/admin-selfsigned.{crt,key}` by default). See [Admin TLS cert](#admin-tls-cert) below.

The host firewall must drop traffic on `:9443` from every non-VPN interface — that's the outermost fence.

## Admin TLS cert

Two practical options for the admin listener cert:

**A) Tailscale-issued Let's Encrypt cert (recommended — no browser warnings)**

```bash
# On the host. Replace <host>.<tailnet>.ts.net with your tailnet hostname.
sudo tailscale cert <host>.<tailnet>.ts.net
sudo mv <host>.<tailnet>.ts.net.crt /etc/nginx/admin-selfsigned.crt
sudo mv <host>.<tailnet>.ts.net.key /etc/nginx/admin-selfsigned.key
sudo systemctl reload nginx
```

The cert is auto-renewable (re-run `tailscale cert` from a cron, or use `tailscale serve` to have it managed for you). Valid only inside the tailnet — the hostname doesn't resolve outside.

**B) Self-signed (works anywhere, browser warns once per device)**

```bash
sudo openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
  -keyout /etc/nginx/admin-selfsigned.key \
  -out    /etc/nginx/admin-selfsigned.crt \
  -subj   "/CN=echorift-admin"
sudo chmod 600 /etc/nginx/admin-selfsigned.key
sudo systemctl reload nginx
```

Optional: import the `.crt` into your admin device's OS trust store to silence the warning permanently.

`api` and `web` are intentionally not published to the host — every request flows through Caddy. The two Caddy listeners aren't redundancy; they're a privilege boundary. See the [Architecture](#architecture) section.

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
docker compose exec caddy sh

# Inspect ports and networks.
docker compose ps
docker compose port caddy 8080      # → host port mapped to caddy:8080

# Stop everything (containers only — bind-mounted data and volumes persist).
docker compose down

# Tear down and also remove the named volumes (caddy-data, caddy-config).
# Bind-mounted ./data is NOT touched.
docker compose down -v
```

## Environment variables

Defined in `.env` at repo root (loaded via `env_file` in `docker-compose.yml`).

| Variable | Purpose |
|----------|---------|
| `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` | Basic-auth credentials. Hash with bcrypt (cost 12). |
| `ADMIN_IPS` | Comma-separated CIDR/IP allowlist for admin endpoints (matched in `IpWhitelistGuard`). |
| `COOKIE_SECRET` | Signs session + CSRF cookies. Required; rotate to invalidate all sessions. |
| `WEB_ORIGIN` | CORS origin for the API. |
| `API_INTERNAL_URL` | Server-side URL the web app uses to reach the API (`http://api:3001` in compose). |
| `SWAGGER_ENABLED` | `true` mounts Swagger UI at `/api/docs`. Default off — keep off in production. |
| `SITE_NAME` / `YOUTUBE_URL` / `INSTAGRAM_URL` / `FACEBOOK_URL` | Branding + footer links. |

> Storage paths (`/app/data`, `/app/music`) aren't configurable via `.env` — they're baked into the image and the bind mounts in `docker-compose.yml`. To point at a different music source, edit the `volumes:` entry under the `api` service.

## API documentation

When `SWAGGER_ENABLED=true`, an interactive OpenAPI UI is available at `/api/docs`.

In production, `/api/docs` and `/api/docs-json` are blocked at the public Caddy listener — they're only reachable via the admin listener, which is itself reachable only over the VPN. Even if the env var is accidentally left on in production, the schema can't leak to the public internet.

All public endpoints are under `/api/tracks`. Admin endpoints are under `/api/admin` and require:
- IP allowlist match (`IpWhitelistGuard`)
- Signed session cookie (`SessionGuard`, set by `POST /api/admin/login`)
- CSRF token in `X-CSRF-Token` header for unsafe methods

## Security model

- **Defense in depth:** host firewall → host nginx (TLS) → Caddy → NestJS guards. Admin-only paths are blocked at *every* layer, not just the innermost.
- **Admin transport:** VPN-only (Tailscale / WireGuard) **plus** independent TLS at nginx on `:9443`. Two crypto layers — a misconfigured VPN won't drop admin to plain HTTP.
- **Strict CSP** via Helmet (script-src `'self'`, no inline). Relaxed only on `/api/docs` when Swagger is enabled.
- **Rate limiting:** 100 req/min globally; login endpoint locked to 5 attempts per 5 min with deterministic `Retry-After`. nginx adds an extra 10 r/m perimeter cap on `/api/admin/login`.
- **Session cookies:** `httpOnly`, `signed`, `sameSite=strict`, scoped to `/api/admin`, `secure` derived from `req.secure`. Both nginx vhosts terminate TLS, so the cookie is always issued with the `Secure` flag.
- **Music streaming:** static `serve-static` with HTTP Range, immutable cache, long keep-alive (75s) for multi-hour single-socket downloads.

## Scripts

From repo root:

```bash
pnpm build      # builds all workspaces
pnpm lint       # lints all workspaces
pnpm dev        # runs api + web in watch mode
```

Per-workspace:

```bash
pnpm --filter @echorift/api dev
pnpm --filter @echorift/web dev
pnpm --filter @echorift/shared build
```
