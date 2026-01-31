import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationThrottlesXXXXXX implements MigrationInterface {
  name = 'CreateNotificationThrottlesXXXXXX';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_throttles" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "notificationType" varchar(100) NOT NULL UNIQUE,
        "maxBatchSize" int NOT NULL DEFAULT 10,
        "windowSeconds" int NOT NULL DEFAULT 300,
        "cooldownSeconds" int NOT NULL DEFAULT 60,
        "enabled" boolean NOT NULL DEFAULT true,
        "currentBatchCount" int NOT NULL DEFAULT 0,
        "batchStartedAt" TIMESTAMPTZ,
        "lastSentAt" TIMESTAMPTZ,
        "pendingCount" int NOT NULL DEFAULT 0,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notification_throttles_type"
      ON "notification_throttles" ("notificationType");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_notification_throttles_enabled"
      ON "notification_throttles" ("enabled");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_throttles"`);
  }
}
