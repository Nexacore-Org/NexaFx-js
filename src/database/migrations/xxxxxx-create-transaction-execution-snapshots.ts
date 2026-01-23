import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionExecutionSnapshotsXXXXXX implements MigrationInterface {
  name = 'CreateTransactionExecutionSnapshotsXXXXXX';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_execution_snapshots" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "transactionId" varchar NOT NULL,
        "status" varchar(50) NOT NULL,
        "durationMs" int,
        "metadata" jsonb NOT NULL,
        "logs" jsonb,
        "errorMessage" text,
        "errorStack" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transaction_execution_snapshots_txnId"
      ON "transaction_execution_snapshots" ("transactionId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction_execution_snapshots"`);
  }
}
