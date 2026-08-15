FROM postgres:17-bookworm AS postgres-tools

FROM node:22-slim

WORKDIR /app

# Install build tools for native deps (bcrypt)
RUN apt-get update && apt-get install -y python3 make g++ libpq5 libzstd1 liblz4-1 ffmpeg fonts-dejavu-core && rm -rf /var/lib/apt/lists/*

# Debian bookworm ships an older pg_dump than managed production databases.
# Pin the portable backup/inspection tools to PostgreSQL 17 so they can read
# current servers as well as older supported database versions.
COPY --from=postgres-tools /usr/lib/postgresql/17/bin/pg_dump /usr/local/bin/pg_dump
COPY --from=postgres-tools /usr/lib/postgresql/17/bin/pg_restore /usr/local/bin/pg_restore

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN chmod +x /app/scripts/migrate-production.mjs

# Vite inlines VITE_* env vars at build time via import.meta.env
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

# Non-secret release metadata makes the serving image and source worktree
# independently identifiable after deployment, including dirty-tree releases.
ARG CREATIVESOS_SOURCE_COMMIT
ARG CREATIVESOS_SOURCE_FINGERPRINT
ARG CREATIVESOS_SOURCE_DIRTY
ARG CREATIVESOS_BUILD_ID
ARG CREATIVESOS_BUILD_TIME
ENV CREATIVESOS_SOURCE_COMMIT=$CREATIVESOS_SOURCE_COMMIT
ENV CREATIVESOS_SOURCE_FINGERPRINT=$CREATIVESOS_SOURCE_FINGERPRINT
ENV CREATIVESOS_SOURCE_DIRTY=$CREATIVESOS_SOURCE_DIRTY
ENV CREATIVESOS_BUILD_ID=$CREATIVESOS_BUILD_ID
ENV CREATIVESOS_BUILD_TIME=$CREATIVESOS_BUILD_TIME

# A missing key produces a bundle that cannot render. Fail the image build
# instead of allowing that broken bundle to reach production.
RUN test -n "$VITE_CLERK_PUBLISHABLE_KEY"
RUN test -n "$CREATIVESOS_SOURCE_COMMIT" \
    && test -n "$CREATIVESOS_SOURCE_FINGERPRINT" \
    && test -n "$CREATIVESOS_SOURCE_DIRTY" \
    && test -n "$CREATIVESOS_BUILD_ID" \
    && test -n "$CREATIVESOS_BUILD_TIME"

RUN npm run build

# Clean up build tools after native modules are compiled
RUN apt-get purge -y python3 make g++ && apt-get autoremove -y

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
