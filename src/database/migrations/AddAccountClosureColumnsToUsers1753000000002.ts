import { MigrationInterface, QueryRunner } from 'typeorm';

/** Closure fields on the real users table, replacing the parallel user_accounts table (issue #1399). */
export class AddAccountClosureColumnsToUsers1753000000002 implements MigrationInterface {
  name = 'AddAccountClosureColumnsToUsers1753000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "closedAt" timestamp,
        ADD COLUMN IF NOT EXISTS "piiPurgeAt" timestamp,
        ADD COLUMN IF NOT EXISTS "piiPurgedAt" timestamp
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "piiPurgedAt",
        DROP COLUMN IF EXISTS "piiPurgeAt",
        DROP COLUMN IF EXISTS "closedAt"
    `);
  }
}
