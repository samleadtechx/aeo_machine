# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps

COPY package.json package-lock.json ./
# Coolify can expose runtime env vars during build. Force build tooling such as
# Tailwind/PostCSS/TypeScript to install even if NODE_ENV=production is present.
RUN npm ci --include=dev

FROM deps AS builder

COPY . .
RUN mkdir -p public
RUN npx prisma generate
RUN npm run build

FROM base AS runner

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV STORAGE_DIR=/app/storage

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
RUN npm prune --omit=dev && npm cache clean --force

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh \
  && mkdir -p /app/storage/media /app/storage/builds /app/storage/tmp \
  && chown -R node:node /app

USER node

VOLUME ["/app/storage"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
