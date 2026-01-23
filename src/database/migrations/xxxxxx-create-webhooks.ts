import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWebhooksXXXXXX implements MigrationInterface {
  name = 'CreateWebhooksXXXXXX';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "webhook_subscriptions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "url" varchar(500) NOT NULL UNIQUE,
        "events" jsonb NOT NULL,
        "secret" varchar(255) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "subscriptionId" varchar NOT NULL,
        "eventName" varchar(100) NOT NULL,
        "payload" jsonb NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "attempts" int NOT NULL DEFAULT 0,
        "lastHttpStatus" int,
        "lastError" text,
        "nextRetryAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_webhook_deliveries_subscriptionId"
      ON "webhook_deliveries" ("subscriptionId");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_webhook_deliveries_eventName"
      ON "webhook_deliveries" ("eventName");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "webhook_deliveries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "webhook_subscriptions"`);
  }
}
