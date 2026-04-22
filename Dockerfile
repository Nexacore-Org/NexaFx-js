# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig*.json nest-cli.json ./
COPY src/ ./src/

RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS production

RUN addgroup -S nexafx && adduser -S nexafx -G nexafx

WORKDIR /app

COPY --from=builder --chown=nexafx:nexafx /app/node_modules ./node_modules
COPY --from=builder --chown=nexafx:nexafx /app/dist ./dist
COPY --from=builder --chown=nexafx:nexafx /app/package.json ./package.json

USER nexafx

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/main"]
