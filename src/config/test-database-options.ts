/**
 * Single source of truth for the destructive test database connection
 * (issue #1545). Used by AppModule (NODE_ENV=test) and TestDatabaseModule.
 *
 * Jest sets NODE_ENV=test automatically, so any spec that boots AppModule would
 * otherwise run `DROP SCHEMA public CASCADE` against whatever TEST_DB_* resolves
 * to. The old default was the maintenance database `postgres` on localhost, which
 * is also what `docker compose up db` exposes. Now `dropSchema` is refused unless
 * the database name is set explicitly and looks like a test database.
 */

/** A name that clearly marks a disposable database: nexafx_test, nexafx-test, ... */
export const TEST_DATABASE_NAME_PATTERN = /(_|-)test$/i;

export class UnsafeTestDatabaseError extends Error {}

export interface TestDatabaseOptions {
  type: 'postgres';
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  autoLoadEntities: true;
  synchronize: true;
  dropSchema: true;
  retryAttempts: 0;
}

export function buildTestDatabaseOptions(env: NodeJS.ProcessEnv = process.env): TestDatabaseOptions {
  const database = env.TEST_DB_DATABASE?.trim();

  if (!database) {
    throw new UnsafeTestDatabaseError(
      'TEST_DB_DATABASE is not set. Tests drop and recreate the schema, so the target database must be ' +
        'named explicitly, e.g. TEST_DB_DATABASE=nexafx_test (docker compose creates it).',
    );
  }

  const allowDrop = env.TEST_DB_ALLOW_DROP === 'true';
  if (!allowDrop && !TEST_DATABASE_NAME_PATTERN.test(database)) {
    throw new UnsafeTestDatabaseError(
      `Refusing to drop the schema of database "${database}": its name must end in "_test" or "-test". ` +
        'Use a dedicated test database, or set TEST_DB_ALLOW_DROP=true if you really mean it.',
    );
  }

  return {
    type: 'postgres',
    host: env.TEST_DB_HOST ?? 'localhost',
    port: Number(env.TEST_DB_PORT ?? 5432),
    username: env.TEST_DB_USERNAME ?? 'postgres',
    password: env.TEST_DB_PASSWORD ?? 'postgres',
    database,
    autoLoadEntities: true,
    synchronize: true,
    dropSchema: true,
    retryAttempts: 0,
  };
}
