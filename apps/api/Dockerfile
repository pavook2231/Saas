FROM node:20-bullseye-slim AS base
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl wget \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps

COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/utils/package.json packages/utils/package.json

RUN npm ci

FROM deps AS source

COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages packages

FROM source AS migrator

RUN npm run prisma:generate -w @saas/api

FROM source AS builder

RUN npm run prisma:generate -w @saas/api \
  && npm run build -w @saas/api \
  && npm prune --omit=dev \
  && npm cache clean --force

FROM base AS runner

ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/packages ./packages

EXPOSE 3001

CMD ["node", "apps/api/dist/main.js"]
