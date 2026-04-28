import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuthFields20260424000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Refresh token rotation fields
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS "refreshTokenHash" VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "refreshTokenFamily" VARCHAR(64),
        ADD COLUMN IF NOT EXISTS "refreshTokenExpiry" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "passwordResetTokenHash" VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "passwordResetExpiry" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "emailVerificationTokenHash" VARCHAR(255);
    `);

    // 2FA fields
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS "twoFactorSecret" VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "twoFactorBackupCodes" TEXT;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS "refreshTokenHash",
        DROP COLUMN IF EXISTS "refreshTokenFamily",
        DROP COLUMN IF EXISTS "refreshTokenExpiry",
        DROP COLUMN IF EXISTS "passwordResetTokenHash",
        DROP COLUMN IF EXISTS "passwordResetExpiry",
        DROP COLUMN IF EXISTS "emailVerifiedAt",
        DROP COLUMN IF EXISTS "emailVerificationTokenHash",
        DROP COLUMN IF EXISTS "twoFactorSecret",
        DROP COLUMN IF EXISTS "twoFactorEnabled",
        DROP COLUMN IF EXISTS "twoFactorBackupCodes";
    `);
  }
}
