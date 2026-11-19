import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateActivityFeedItems1760100000001 implements MigrationInterface {
  name = 'CreateActivityFeedItems1760100000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "activity_feed_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "type" varchar(30) NOT NULL CHECK ("type" IN ('transaction','kyc','login','profile_update','wallet')),
        "title" varchar(255) NOT NULL,
        "description" text NOT NULL,
        "metadata" jsonb,
        "isRead" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_activity_feed_items_user_created" ON "activity_feed_items" ("userId","createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_activity_feed_items_type" ON "activity_feed_items" ("type")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_activity_feed_items_user_read" ON "activity_feed_items" ("userId","isRead")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_activity_feed_items_user_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_activity_feed_items_type"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_activity_feed_items_user_read"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "activity_feed_items"`);
  }
}
