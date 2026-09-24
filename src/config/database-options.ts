/**
 * Issue #1290 — single source of truth for Postgres connection options,
 * shared between the running application (via configuration.ts /
 * app.module.ts's TypeOrmModule.forRootAsync) and the CLI migration/seed
 * path (src/database/data-source.ts). Both previously derived connection
 * settings independently from raw process.env.DB_*, and only the app path
 * handled DB_SSL — migrations/seeds could silently run against a
 * differently-configured (e.g. non-TLS) connection than the app itself.
 *
 * Reads directly from process.env rather than through Nest's ConfigService
 * because data-source.ts runs as a plain TypeORM CLI script outside of any
 * Nest DI context.
 */

export interface PostgresConnectionOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: false | { rejectUnauthorized: boolean };
}

export function buildPostgresConnectionOptions(): PostgresConnectionOptions {
  const sslEnabled = process.env.DB_SSL === 'true';

  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'nexafx_dev',
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
  };
}
