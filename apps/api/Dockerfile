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

FROM base AS prod-deps

COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/utils/package.json packages/utils/package.json

RUN npm ci --omit=dev

FROM source AS migrator

RUN npm run prisma:generate -w @saas/api

FROM source AS builder

RUN npm run prisma:generate -w @saas/api \
  && npm run build -w @saas/api \
  && npm cache clean --force

FROM base AS runner

ENV NODE_ENV=production

COPY --from=prod-deps /app/package*.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/package.json ./apps/api/package.json
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/packages ./packages

EXPOSE 3001

CMD ["node", "apps/api/dist/main.js"]
