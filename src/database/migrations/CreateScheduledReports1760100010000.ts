import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateScheduledReports1760100010000 implements MigrationInterface {
  name = 'CreateScheduledReports1760100010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "scheduled_reports_reporttype_enum" AS ENUM('transaction_summary','fee_summary','portfolio');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "scheduled_reports_frequency_enum" AS ENUM('daily','weekly','monthly');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "scheduled_reports" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "reportType" "scheduled_reports_reporttype_enum" NOT NULL,
        "frequency" "scheduled_reports_frequency_enum" NOT NULL,
        "nextRunAt" TIMESTAMP NOT NULL,
        "lastRunAt" TIMESTAMP,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_scheduled_reports_user_active" ON "scheduled_reports" ("userId","isActive")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_scheduled_reports_next_run" ON "scheduled_reports" ("nextRunAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_scheduled_reports_user_active"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_scheduled_reports_next_run"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "scheduled_reports"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "scheduled_reports_frequency_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "scheduled_reports_reporttype_enum"`,
    );
  }
}
