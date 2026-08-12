FROM node:22-slim

WORKDIR /app

# Install build tools for native deps (bcrypt)
RUN apt-get update && apt-get install -y python3 make g++ postgresql-client && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN chmod +x /app/scripts/migrate-production.mjs

# Vite inlines VITE_* env vars at build time via import.meta.env
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

# A missing key produces a bundle that cannot render. Fail the image build
# instead of allowing that broken bundle to reach production.
RUN test -n "$VITE_CLERK_PUBLISHABLE_KEY"

RUN npm run build

# Clean up build tools after native modules are compiled
RUN apt-get purge -y python3 make g++ && apt-get autoremove -y

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
