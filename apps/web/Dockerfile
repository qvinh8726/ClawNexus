# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY turbo.json ./
COPY packages/shared-types/package*.json ./packages/shared-types/
COPY apps/web/package*.json ./apps/web/

RUN npm ci

# Copy source files
COPY packages/shared-types ./packages/shared-types
COPY apps/web ./apps/web

# Build
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=@clawai/shared-types
RUN npm run build --workspace=@clawai/web

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone build
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
