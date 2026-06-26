import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOtpLookupIndex1752000000000 implements MigrationInterface {
  name = 'AddOtpLookupIndex1752000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_otps_userId_purpose_createdAt" ON "otps" ("userId", "purpose", "createdAt" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_otps_userId_purpose_createdAt"`,
    );
  }
}
