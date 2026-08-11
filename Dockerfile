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
# Bind on all interfaces so Docker can route traffic to the container
ENV HOSTNAME=0.0.0.0
# Write SQLite db and JSON files to the declared VOLUME path — not ./data (which resolves to /app/data)
ENV DATA_DIR=/data

# standalone output includes everything needed to run
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# better-sqlite3 native bindings are not traced by Next.js standalone — copy explicitly
COPY --from=builder /app/node_modules/better-sqlite3/build ./node_modules/better-sqlite3/build

# data directory — mount a persistent volume at this path in production
VOLUME /data

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s \
  CMD node -e "require('http').get('http://localhost:3000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
