import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRateAlertLifecycle1760100000000 implements MigrationInterface {
  name = 'AddRateAlertLifecycle1760100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rate_alerts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "currencyPair" varchar(20) NOT NULL,
        "targetRate" decimal(18,8) NOT NULL,
        "direction" varchar(10) NOT NULL,
        "triggered" boolean NOT NULL DEFAULT false,
        "isActive" boolean NOT NULL DEFAULT true,
        "triggeredAt" timestamp,
        "deactivatedAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rate_alert_history" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "alertId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "currencyPair" varchar(20) NOT NULL,
        "triggeredRate" decimal(18,8) NOT NULL,
        "targetRate" decimal(18,8) NOT NULL,
        "direction" varchar(10) NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "rate_alerts" ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "rate_alerts" ADD COLUMN IF NOT EXISTS "triggeredAt" timestamp`,
    );
    await queryRunner.query(
      `ALTER TABLE "rate_alerts" ADD COLUMN IF NOT EXISTS "deactivatedAt" timestamp`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_rate_alerts_user_id" ON "rate_alerts" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_rate_alerts_pair" ON "rate_alerts" ("currencyPair")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_rate_alerts_user_active" ON "rate_alerts" ("userId", "isActive")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_rate_alerts_pair_triggered_active" ON "rate_alerts" ("currencyPair", "triggered", "isActive")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_rate_alert_history_user_created" ON "rate_alert_history" ("userId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_rate_alert_history_alert" ON "rate_alert_history" ("alertId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_rate_alert_history_pair_created" ON "rate_alert_history" ("currencyPair", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_rate_alert_history_pair_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_rate_alert_history_alert"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_rate_alert_history_user_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_rate_alerts_pair_triggered_active"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_rate_alerts_user_active"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_rate_alerts_pair"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_rate_alerts_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rate_alert_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rate_alerts"`);
  }
}
