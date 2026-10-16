import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminApprovalLifecycle1752200000000 implements MigrationInterface {
  name = 'AddAdminApprovalLifecycle1752200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "admin_approvals" ADD COLUMN IF NOT EXISTS "rejectedBy" uuid`);
    await queryRunner.query(`ALTER TABLE "admin_approvals" ADD COLUMN IF NOT EXISTS "rejectionReason" varchar(500)`);
    await queryRunner.query(`ALTER TABLE "admin_approvals" ADD COLUMN IF NOT EXISTS "expiresAt" timestamp`);
    await queryRunner.query(`ALTER TABLE "admin_approvals" ADD COLUMN IF NOT EXISTS "executedAt" timestamp`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "admin_approvals" DROP COLUMN IF EXISTS "executedAt"`);
    await queryRunner.query(`ALTER TABLE "admin_approvals" DROP COLUMN IF EXISTS "expiresAt"`);
    await queryRunner.query(`ALTER TABLE "admin_approvals" DROP COLUMN IF EXISTS "rejectionReason"`);
    await queryRunner.query(`ALTER TABLE "admin_approvals" DROP COLUMN IF EXISTS "rejectedBy"`);
  }
}
