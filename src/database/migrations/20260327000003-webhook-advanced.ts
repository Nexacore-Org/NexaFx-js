import { MigrationInterface, QueryRunner } from 'typeorm';

export class WebhookAdvanced20260327000003 implements MigrationInterface {
  name = 'WebhookAdvanced20260327000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add payloadFilter to webhook_subscriptions
    await queryRunner.query(`
      ALTER TABLE "webhook_subscriptions"
      ADD COLUMN IF NOT EXISTS "payloadFilter" jsonb;
    `);

    // Add latencyMs and isReplay to webhook_deliveries
    await queryRunner.query(`
      ALTER TABLE "webhook_deliveries"
      ADD COLUMN IF NOT EXISTS "latencyMs" int,
      ADD COLUMN IF NOT EXISTS "isReplay" boolean NOT NULL DEFAULT false;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_webhook_deliveries_status"
      ON "webhook_deliveries" ("status");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_webhook_deliveries_createdAt"
      ON "webhook_deliveries" ("createdAt");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "webhook_subscriptions" DROP COLUMN IF EXISTS "payloadFilter"`);
    await queryRunner.query(`ALTER TABLE "webhook_deliveries" DROP COLUMN IF EXISTS "latencyMs"`);
    await queryRunner.query(`ALTER TABLE "webhook_deliveries" DROP COLUMN IF EXISTS "isReplay"`);
  }
}
