# ==============================================================================
# MedCore HMS — Backend Production Dockerfile (NestJS + Prisma + BullMQ)
# Multi-stage production build with minimal attack surface and non-root execution
# ==============================================================================

# --- Stage 1: Build & Prune ---
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm and native compilation requirements
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Copy workspace package manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ ./packages/
COPY backend/package.json ./backend/

# Install all dependencies (including devDependencies required for Nest build & Prisma)
RUN pnpm install --frozen-lockfile

# Copy backend source and schema
COPY backend/ ./backend/

# Generate Prisma Client binary and build NestJS production bundle
WORKDIR /app/backend
RUN npx prisma generate
RUN pnpm run build

# --- Stage 2: Production Runtime ---
FROM node:22-alpine AS runner

WORKDIR /app/backend

# Install security utilities and runtime dependencies
RUN apk add --no-cache dumb-init openssl wget

ENV NODE_ENV=production
ENV PORT=3001

# Copy package manifests and workspace structure
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/
COPY --from=builder /app/packages/ /app/packages/
COPY --from=builder /app/backend/package.json ./
COPY --from=builder /app/backend/prisma/ ./prisma/
COPY --from=builder /app/backend/dist/ ./dist/
COPY --from=builder /app/node_modules/ /app/node_modules/
COPY --from=builder /app/backend/node_modules/ ./node_modules/

# Create non-root upload storage directory
RUN mkdir -p /app/backend/uploads && chown -R node:node /app

USER node

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3001/api/v1/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
