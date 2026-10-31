#!/bin/sh
# Enforces the correct permission posture on the project checkout.
#
# What actually needs protecting here is `.env` — it holds COOKIE_SECRET and
# ADMIN_PASSWORD_HASH. Everything else in this tree is source-available code
# (PolyForm Noncommercial); locking it to 600 protects nothing and actively
# breaks the stack, so this script deliberately does NOT do that. The runtime
# data is hardened separately and already: the `data-init` service chowns the
# volume to 1000 and applies 700 dirs / 600 files, and the API sets
# `process.umask(0o077)` so everything it writes at runtime is 600.
#
# Two constraints make a blanket `chmod -R 600 .` wrong, both learned the hard
# way (it took down api and caddy):
#
#   1. Bind-mounted files are read by the container's own process, with that
#      process's uid and capabilities — not by the daemon. `caddy` runs as uid 0
#      but with `cap_drop: ALL`, which removes CAP_DAC_OVERRIDE, the capability
#      that normally lets root ignore mode bits. A 600 Caddyfile owned by anyone
#      else is simply unreadable to it:
#        "reading config from file: open /etc/caddy/Caddyfile: permission denied"
#
#   2. `COPY` preserves mode bits from the build context into the image, and
#      `--chown=root:root` changes the owner but not the mode. Both runner stages
#      then switch to `USER node` (uid 1000), so a 600 file copied from the host
#      is unreadable at runtime. `packages/shared/package.json` is the one that
#      bites: Node must read a package's package.json to resolve its `main`, and
#      the EACCES surfaces as the far more confusing
#        "Error: Cannot find module '@echorift/shared'"
#      The Dockerfile now defends itself with `chmod -R a+rX` in the build
#      stages, but keep the checkout sane regardless.
#
# Run as the user that owns the checkout — no root needed:
#   ./scripts/harden-permissions.sh
set -eu

cd "$(dirname "$0")/.."

# Normalise the tree to standard modes (idempotent; repairs an over-locked
# checkout). .git is left alone — git manages its own object permissions.
find . -path ./.git -prune -o -type d -exec chmod 755 {} +
find . -path ./.git -prune -o -type f -exec chmod 644 {} +

# Restore the execute bit on anything meant to be run directly.
chmod 755 scripts/*.sh

# The actual secret. env.example is a template and stays readable.
[ -f .env ] && chmod 600 .env

echo "Checkout normalised to 755/644; .env locked to 600."

# Fail loudly if anything a container must read ended up unreadable, rather than
# discovering it as a crash-loop minutes later.
unreadable=$(find . -path ./.git -prune -o -type f ! -perm -o+r -print \
             | grep -v '^\./\.env$' || true)
if [ -n "$unreadable" ]; then
  echo "WARNING: these files are not world-readable and may break builds or bind mounts:" >&2
  echo "$unreadable" >&2
  exit 1
fi

echo "Verified: nothing but .env is owner-only."
