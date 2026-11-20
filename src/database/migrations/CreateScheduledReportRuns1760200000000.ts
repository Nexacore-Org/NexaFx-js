import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateScheduledReportRuns1760200000000 implements MigrationInterface {
  name = 'CreateScheduledReportRuns1760200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        CREATE TYPE "scheduled_report_runs_status_enum" AS ENUM ('success', 'failed');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "scheduled_report_runs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "reportId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "status" "scheduled_report_runs_status_enum" NOT NULL,
        "periodStart" timestamp NOT NULL,
        "periodEnd" timestamp NOT NULL,
        "payload" jsonb,
        "fileReference" text,
        "error" text,
        "deliveredAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_scheduled_report_runs_report_created" ON "scheduled_report_runs" ("reportId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_scheduled_report_runs_user_created" ON "scheduled_report_runs" ("userId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_scheduled_report_runs_status_created" ON "scheduled_report_runs" ("status", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_scheduled_report_runs_status_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_scheduled_report_runs_user_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_scheduled_report_runs_report_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "scheduled_report_runs"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "scheduled_report_runs_status_enum"`,
    );
  }
}
