import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotifications20260327000001 implements MigrationInterface {
  name = 'CreateNotifications20260327000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notifications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "type" varchar(100) NOT NULL,
        "title" varchar(255) NOT NULL,
        "body" text NOT NULL,
        "data" jsonb,
        "isRead" boolean NOT NULL DEFAULT false,
        "readAt" TIMESTAMPTZ,
        "isArchived" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_notifications_user_created"
      ON "notifications" ("userId", "createdAt");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_notifications_user_read"
      ON "notifications" ("userId", "isRead");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_notifications_userId"
      ON "notifications" ("userId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
  }
}
