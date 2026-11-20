import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRateLimitRecords1760100010004 implements MigrationInterface {
  name = 'CreateRateLimitRecords1760100010004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rate_limit_records" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "endpoint" varchar(255) NOT NULL,
        "requestCount" integer NOT NULL DEFAULT 0,
        "windowStart" timestamptz NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_rate_limit_records_user_endpoint" ON "rate_limit_records" ("userId","endpoint")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_rate_limit_records_user_endpoint"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "rate_limit_records"`);
  }
}
