import { MigrationInterface, QueryRunner } from 'typeorm';

/** `status` becomes a plain varchar (simple-enum) and failures can be recorded on the row. */
export class AdminApprovalSimpleEnumAndError1753000000000 implements MigrationInterface {
  name = 'AdminApprovalSimpleEnumAndError1753000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "admin_approvals" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "admin_approvals" ALTER COLUMN "status" TYPE varchar USING "status"::text`);
    await queryRunner.query(`ALTER TABLE "admin_approvals" ALTER COLUMN "status" SET DEFAULT 'pending'`);
    await queryRunner.query(`DROP TYPE IF EXISTS "admin_approvals_status_enum"`);
    await queryRunner.query(`ALTER TABLE "admin_approvals" ADD COLUMN IF NOT EXISTS "lastError" varchar(500)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "admin_approvals" DROP COLUMN IF EXISTS "lastError"`);
  }
}
