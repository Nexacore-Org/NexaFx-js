import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRateAlerts1760100000002 implements MigrationInterface {
  name = 'CreateRateAlerts1760100000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rate_alerts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "currencyPair" varchar(255) NOT NULL,
        "targetRate" decimal(18,8) NOT NULL,
        "direction" varchar(10) NOT NULL,
        "triggered" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_rate_alerts_user" ON "rate_alerts" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_rate_alerts_currency_pair" ON "rate_alerts" ("currencyPair")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_rate_alerts_user"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_rate_alerts_currency_pair"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "rate_alerts"`);
  }
}
