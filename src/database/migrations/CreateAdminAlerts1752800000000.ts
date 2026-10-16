import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminAlerts1752800000000 implements MigrationInterface {
  name = 'CreateAdminAlerts1752800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "admin_alerts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "type" varchar(100) NOT NULL,
        "subject" varchar(100) NOT NULL DEFAULT 'global',
        "severity" varchar(20) NOT NULL,
        "title" varchar(255) NOT NULL,
        "message" text NOT NULL,
        "metadata" jsonb,
        "suppressed" boolean NOT NULL DEFAULT false,
        "read" boolean NOT NULL DEFAULT false,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_admin_alerts_created_at" ON "admin_alerts" ("createdAt")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_admin_alerts_type_subject" ON "admin_alerts" ("type", "subject")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_alerts"`);
  }
}
