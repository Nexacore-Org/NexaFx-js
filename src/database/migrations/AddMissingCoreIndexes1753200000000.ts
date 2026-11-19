import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Issue #1544: these indexes were declared on the entities and listed in
 * docs/database-indexes.md but no migration created them, so every environment
 * built with `migration:run` (production uses synchronize: false) was missing
 * them. CONCURRENTLY avoids blocking writes on the hot tables, which requires
 * running outside a transaction.
 */
export class AddMissingCoreIndexes1753200000000 implements MigrationInterface {
  name = 'AddMissingCoreIndexes1753200000000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_transactions_txHash" ON "transactions" ("txHash")`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_transactions_senderId_status" ON "transactions" ("senderId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_audit_logs_userId_createdAt" ON "audit_logs" ("userId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_audit_logs_action_createdAt" ON "audit_logs" ("action", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_audit_logs_action_createdAt"`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_audit_logs_userId_createdAt"`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_transactions_senderId_status"`);
    await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_transactions_txHash"`);
  }
}
