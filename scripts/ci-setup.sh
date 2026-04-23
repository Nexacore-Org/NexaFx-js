#!/usr/bin/env bash
# scripts/ci-setup.sh — Test environment setup for CI
set -euo pipefail

echo "==> Waiting for PostgreSQL..."
until pg_isready -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" -U "${DB_USER:-nexafx}"; do
  sleep 2
done
echo "==> PostgreSQL ready"

echo "==> Waiting for Redis..."
until redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" ping | grep -q PONG; do
  sleep 2
done
echo "==> Redis ready"

echo "==> Running database migrations..."
npm run migration:run 2>/dev/null || echo "No migration:run script — skipping"

echo "==> Seeding test data..."
npm run seed 2>/dev/null || echo "No seed script — skipping"

echo "==> CI environment ready"
