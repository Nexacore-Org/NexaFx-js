import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationPreferences20260327000002 implements MigrationInterface {
  name = 'CreateNotificationPreferences20260327000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification_preferences" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "notificationType" varchar(100) NOT NULL,
        "inApp" boolean NOT NULL DEFAULT true,
        "push" boolean NOT NULL DEFAULT true,
        "sms" boolean NOT NULL DEFAULT false,
        "email" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE ("userId", "notificationType")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_notif_pref_userId"
      ON "notification_preferences" ("userId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_preferences"`);
  }
}
