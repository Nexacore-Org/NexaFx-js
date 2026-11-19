import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * #1614: the auth lockout and admin 2FA columns existed on the `User` entity
 * but were never migrated, so production login queries failed with
 * `column "failedLoginAttempts" does not exist`.
 *
 * Every statement is idempotent: partial deploys may already have added some
 * of these columns, and re-running the migration must be harmless.
 */
export class AddLoginLockoutAnd2faToUsers1754300000000
  implements MigrationInterface
{
  name = 'AddLoginLockoutAnd2faToUsers1754300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "require2fa" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "failedLoginAttempts" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lockedUntil" timestamptz NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "lockedUntil"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "failedLoginAttempts"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "require2fa"`,
    );
  }
}
