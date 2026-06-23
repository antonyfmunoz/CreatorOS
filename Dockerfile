FROM node:20-slim

WORKDIR /app

# Install build tools for native deps (bcrypt)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Vite inlines VITE_* env vars at build time via import.meta.env
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

RUN npm run build

# Clean up build tools after native modules are compiled
RUN apt-get purge -y python3 make g++ && apt-get autoremove -y

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
