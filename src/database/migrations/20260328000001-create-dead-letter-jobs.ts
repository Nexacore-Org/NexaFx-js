import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDeadLetterJobs20260328000001 implements MigrationInterface {
  name = 'CreateDeadLetterJobs20260328000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dead_letter_jobs" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "originalQueue"   varchar(100) NOT NULL,
        "originalJobName" varchar(100) NOT NULL,
        "originalJobData" jsonb,
        "failureReason"   text NOT NULL,
        "idempotencyKey"  varchar(100) NOT NULL,
        "attemptsMade"    int NOT NULL,
        "failedAt"        TIMESTAMPTZ NOT NULL,
        "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_dlj_original_queue"
        ON "dead_letter_jobs" ("originalQueue");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_dlj_created_at"
        ON "dead_letter_jobs" ("createdAt");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "dead_letter_jobs"`);
  }
}
