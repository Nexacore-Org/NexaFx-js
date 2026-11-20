import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEndpointRateLimitConfigs1760100010002 implements MigrationInterface {
  name = 'CreateEndpointRateLimitConfigs1760100010002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "endpoint_rate_limit_configs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "endpoint" varchar(255) NOT NULL,
        "method" varchar(10) NOT NULL,
        "maxRequests" integer NOT NULL DEFAULT 100,
        "windowMs" integer NOT NULL DEFAULT 60000,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_5ebaab1c6d9e357e782d6a2aec5" ON "endpoint_rate_limit_configs" ("endpoint")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_5ebaab1c6d9e357e782d6a2aec5"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "endpoint_rate_limit_configs"`,
    );
  }
}
