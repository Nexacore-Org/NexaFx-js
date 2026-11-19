import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRateAlertHistory1760100000003 implements MigrationInterface {
  name = 'CreateRateAlertHistory1760100000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rate_alert_history" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "alertId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "currencyPair" varchar(20) NOT NULL,
        "triggeredRate" decimal(18,8) NOT NULL,
        "targetRate" decimal(18,8) NOT NULL,
        "direction" varchar(10) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_rate_alert_history_user_created" ON "rate_alert_history" ("userId","createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_rate_alert_history_alert" ON "rate_alert_history" ("alertId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_rate_alert_history_currency_pair_created" ON "rate_alert_history" ("currencyPair","createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_rate_alert_history_user_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_rate_alert_history_alert"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_rate_alert_history_currency_pair_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "rate_alert_history"`);
  }
}
