import { INestApplication } from '@nestjs/common';
import { getDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * TestDatabaseHelper — utilities for seeding and cleaning a real test database.
 *
 * E2E tests must use a real DB (no mocking of the DB layer).
 * External services (email, SMS, blockchain) should be mocked at the module level.
 */
export class TestDatabaseHelper {
  private dataSource: DataSource;

  constructor(private readonly app: INestApplication) {}

  /**
   * Obtain the DataSource from the running application.
   */
  async connect(): Promise<void> {
    this.dataSource = this.app.get(DataSource);
  }

  /**
   * Truncate all tables in the correct order to avoid FK constraint violations.
   * Call at the start of each test file's beforeAll / afterEach.
   */
  async truncateAll(): Promise<void> {
    if (!this.dataSource) await this.connect();

    const entities = this.dataSource.entityMetadatas;
    const tableNames = entities
      .map((e) => `"${e.tableName}"`)
      .join(', ');

    if (tableNames) {
      await this.dataSource.query(
        `TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE`,
      );
    }
  }

  /**
   * Run a raw SQL query against the test database.
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<T> {
    if (!this.dataSource) await this.connect();
    return this.dataSource.query(sql, params);
  }

  /**
   * Seed a minimal user with the given id / email into the users table.
   */
  async seedUser(overrides: {
    id?: string;
    email?: string;
    role?: string;
  } = {}): Promise<Record<string, any>> {
    const id = overrides.id ?? crypto.randomUUID();
    const email = overrides.email ?? `test-${id}@example.com`;
    const role = overrides.role ?? 'user';

    await this.dataSource.query(
      `INSERT INTO users (id, email, role, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, email, role],
    );

    return { id, email, role };
  }

  /**
   * Build a mock JWT payload for use in Authorization headers during E2E tests.
   * Uses the JWT service if available, otherwise returns a plain object for guard bypass.
   */
  buildAuthHeader(userId: string, role = 'user'): string {
    // In E2E test setup the JwtAuthGuard is typically overridden to accept any Bearer token.
    // The token value here is used only as an identifier; the guard mock reads req.user directly.
    return `Bearer e2e-test-token-${userId}-${role}`;
  }
}
