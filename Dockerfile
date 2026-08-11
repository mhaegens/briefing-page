# syntax=docker/dockerfile:1
FROM node:22-slim AS builder

# native deps for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- runtime image ----
FROM node:22-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# standalone output includes everything needed to run
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# data directory — mount a volume here in production
VOLUME /data

EXPOSE 3000

CMD ["node", "server.js"]
