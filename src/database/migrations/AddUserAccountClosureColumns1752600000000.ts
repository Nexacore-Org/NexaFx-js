import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Account closure now works on the real `users` table. The unrelated
 * `user_accounts` table (own password/TOTP columns, never linked to users) is
 * dropped; no code path ever wrote to it for a real user.
 */
export class AddUserAccountClosureColumns1752600000000 implements MigrationInterface {
  name = 'AddUserAccountClosureColumns1752600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const column of ['deletedAt', 'closedAt', 'piiPurgeAt', 'piiPurgedAt']) {
      await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "${column}" timestamp`);
    }
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_users_pii_purge_pending" ON "users" ("piiPurgeAt") WHERE "piiPurgedAt" IS NULL AND "piiPurgeAt" IS NOT NULL`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "user_accounts"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_pii_purge_pending"`);
    for (const column of ['piiPurgedAt', 'piiPurgeAt', 'closedAt', 'deletedAt']) {
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "${column}"`);
    }
  }
}
