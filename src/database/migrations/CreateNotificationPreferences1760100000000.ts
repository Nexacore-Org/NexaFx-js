import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationPreferences1760100000000 implements MigrationInterface {
  name = 'CreateNotificationPreferences1760100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_preferences" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "channel" varchar(20) NOT NULL CHECK ("channel" IN ('email','push','in_app','sms')),
        "eventType" varchar(30) NOT NULL CHECK ("eventType" IN ('transaction','security','kyc','promotional','system')),
        "isEnabled" boolean NOT NULL DEFAULT true,
        "batchingEnabled" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_notification_preferences_user_channel_event" ON "notification_preferences" ("userId","channel","eventType")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_notification_preferences_user_channel_event"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_preferences"`);
  }
}
