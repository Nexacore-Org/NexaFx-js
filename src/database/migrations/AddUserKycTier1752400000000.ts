import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserKycTier1752400000000 implements MigrationInterface {
  name = 'AddUserKycTier1752400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "kycTier" varchar(20) NOT NULL DEFAULT 'NONE'`,
    );
    // Carry over tiers that earlier (non-persisting) code left on a metadata blob, if any.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "kycTier"`);
  }
}
