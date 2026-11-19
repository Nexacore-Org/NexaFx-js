import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRateLimitRules1760100010003 implements MigrationInterface {
  name = 'CreateRateLimitRules1760100010003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rate_limit_rules" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "endpoint" varchar(255) NOT NULL,
        "maxRequests" integer NOT NULL,
        "windowSeconds" integer NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_rate_limit_rules_endpoint" ON "rate_limit_rules" ("endpoint")`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "rate_limit_rules"."windowSeconds" IS 'Window length in seconds'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_rate_limit_rules_endpoint"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "rate_limit_rules"`);
  }
}
