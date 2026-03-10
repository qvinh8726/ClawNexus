# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY turbo.json ./
COPY packages/shared-types/package*.json ./packages/shared-types/
COPY packages/database/package*.json ./packages/database/
COPY packages/providers/package*.json ./packages/providers/
COPY packages/routing-engine/package*.json ./packages/routing-engine/
COPY apps/api/package*.json ./apps/api/

RUN npm ci

# Copy source files
COPY packages/shared-types ./packages/shared-types
COPY packages/database ./packages/database
COPY packages/providers ./packages/providers
COPY packages/routing-engine ./packages/routing-engine
COPY apps/api ./apps/api

# Generate Prisma client
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma

# Build all packages
RUN npm run build --workspace=@clawnexus/shared-types
RUN npm run build --workspace=@clawnexus/database
RUN npm run build --workspace=@clawnexus/providers
RUN npm run build --workspace=@clawnexus/routing-engine
RUN npm run build --workspace=@clawnexus/api

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built files and dependencies
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/packages/shared-types/package.json ./packages/shared-types/
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/database/package.json ./packages/database/
COPY --from=builder /app/packages/database/prisma ./packages/database/prisma
COPY --from=builder /app/packages/providers/dist ./packages/providers/dist
COPY --from=builder /app/packages/providers/package.json ./packages/providers/
COPY --from=builder /app/packages/routing-engine/dist ./packages/routing-engine/dist
COPY --from=builder /app/packages/routing-engine/package.json ./packages/routing-engine/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/

# Copy Prisma client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3001

# Run migrations and start
CMD ["sh", "-c", "npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma && node apps/api/dist/main.js"]
