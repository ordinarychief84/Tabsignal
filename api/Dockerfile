# Fastify + Socket.io realtime server. Runs on Bun for parity with dev.
# Single-stage; tiny enough to skip multi-stage. Tagged with the
# locked Bun version to make rebuilds deterministic.
FROM oven/bun:1.1.34-alpine

WORKDIR /app

# Install deps first so package changes invalidate the cache cleanly.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Now the source.
COPY src ./src
COPY tsconfig.json ./

# Fly.io routes 8080 by default, but we keep the app on 4000 to
# match dev / app/.env.local NEXT_PUBLIC_SOCKET_URL semantics.
ENV PORT=4000
EXPOSE 4000

CMD ["bun", "src/index.ts"]
