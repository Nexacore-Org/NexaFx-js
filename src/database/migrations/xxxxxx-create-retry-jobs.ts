import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRetryJobsXXXXXX implements MigrationInterface {
  name = 'CreateRetryJobsXXXXXX';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "retry_jobs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "type" varchar(100) NOT NULL,
        "entityId" varchar(100) NOT NULL,
        "attempts" int NOT NULL DEFAULT 0,
        "nextRunAt" TIMESTAMPTZ NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "lastErrorCategory" varchar(50),
        "lastError" text,
        "meta" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_retry_jobs_type" ON "retry_jobs" ("type");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_retry_jobs_entityId" ON "retry_jobs" ("entityId");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_retry_jobs_nextRunAt" ON "retry_jobs" ("nextRunAt");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "retry_jobs"`);
  }
}
