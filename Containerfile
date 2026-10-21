# syntax=docker/dockerfile:1
#
# Bun-only production image.
#
# The app has no Node.js runtime anywhere in its stack: the build, the server
# and every script run on Bun. The one non-Bun component is the Rust probe,
# which is a standalone binary with no runtime of its own. Podman-compatible
# — no Docker-only features.
#
#   podman build -t uptime-monitor:latest -f Containerfile .
#   podman run --rm -p 3000:3000 --env-file .env.local uptime-monitor:latest
#
# The build needs the public Supabase coordinates, because Next.js inlines
# them into the browser bundle and only inlines what is present when it
# builds:
#
#   podman build \
#     --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
#     --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
#     -t uptime-monitor:latest -f Containerfile .
#
# They are public values — they are in the client bundle either way. The
# service role key is not: it is read from the runtime environment, which is
# what the `--env-file` above is for.

FROM oven/bun:canary-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
# --ignore-scripts: the only postinstall hook in this repo builds the local
# Rust audit tool, which is a developer convenience and has no place in a
# runtime image.
# --mount=type=cache: Bun's download cache survives between builds, so a
# rebuild only fetches what actually changed. Buildah (podman's builder)
# supports the same mount as BuildKit.
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --ignore-scripts

FROM oven/bun:canary-alpine AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
# The runtime image carries no devDependencies: no TypeScript, no ESLint, no
# Playwright browsers.
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --ignore-scripts --omit=dev

# The Rust probe: the syscall-bound half of a monitor check, in a standalone
# binary the Bun runtime spawns. It is the only part of the stack that is
# not Bun, and it needs no runtime of its own.
FROM rust:1-alpine AS probe
WORKDIR /src
# The lockfile is committed, so the build is reproducible.
COPY tools/probe/Cargo.toml tools/probe/Cargo.lock ./
# The dependency tree is fetched before the sources are copied, so a change
# to the code does not refetch the crates.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    cargo fetch --locked
COPY tools/probe/src ./src
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    cargo build --release --locked --target-dir /target
# musl is statically linked, so the binary runs in the Alpine runtime image
# without a libc of its own.

FROM oven/bun:canary-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# The browser bundle needs the public Supabase coordinates at build time.
#
# Next.js inlines a `NEXT_PUBLIC_*` member access into the client bundle when
# it builds, and only if the variable is present when it builds: a variable
# that is missing is left as a runtime lookup, and the browser's `process`
# polyfill has an empty `env`, so it resolves to nothing. The result is a
# sign-in form that cannot find its own Supabase URL.
#
# `.env.local` is excluded from the build context — it is where the secrets
# live — so these have to be handed to the build explicitly.
#
# They are public values, which is what the `NEXT_PUBLIC_` prefix means: they
# end up in the client bundle, where anyone can read them. The service role
# key is not one of them, and it is not here: it is read from the runtime
# environment.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM oven/bun:canary-alpine AS runtime
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# The probe verifies TLS certificates against the system trust store, so the
# store has to be in the image.
RUN apk add --no-cache ca-certificates

# Everything the server writes at runtime (the Next.js cache under .next)
# has to belong to the unprivileged user the server actually runs as.
COPY --chown=bun:bun --from=build /app/.next ./.next
COPY --chown=bun:bun --from=prod-deps /app/node_modules ./node_modules
COPY --chown=bun:bun --from=build /app/package.json ./package.json
COPY --chown=bun:bun --from=build /app/next.config.ts ./next.config.ts
COPY --chown=bun:bun --from=build /app/public ./public
COPY --chown=bun:bun --from=build /app/supabase ./supabase
# The probe lives at /app/probe, which is the second place the runtime looks
# for it. `PROBE_BINARY` overrides both.
COPY --chown=bun:bun --from=probe /target/release/probe ./probe

EXPOSE 3000

# The server does not need root. The `bun` user ships with the base image
# (uid 1000) and owns everything copied above.
USER bun

# `bun run start` is the repository's own entry point, and its script is
# `bun --bun next start` — the `--bun` flag runs Next's server on the Bun
# runtime instead of letting the `#!/usr/bin/env node` shebang pull in a
# Node.js binary. Next reads PORT and HOSTNAME from the environment.
CMD ["bun", "run", "start"]
