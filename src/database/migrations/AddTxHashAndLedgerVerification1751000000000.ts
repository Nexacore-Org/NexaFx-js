import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTxHashAndLedgerVerification1751000000000 implements MigrationInterface {
  name = 'AddTxHashAndLedgerVerification1751000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update transactions.amount and transactions.fee to DECIMAL(20,8)
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "amount" TYPE numeric(20,8) USING "amount"::numeric`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "fee" TYPE numeric(20,8) USING "fee"::numeric`,
    );

    // Add txHash column to transactions
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "txHash" character varying(128)`,
    );

    // Create ledger_verification_results table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ledger_verification_results" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "ranAt" TIMESTAMP NOT NULL DEFAULT now(),
        "totalChecked" integer NOT NULL DEFAULT 0,
        "discrepancyCount" integer NOT NULL DEFAULT 0,
        "discrepancies" jsonb,
        CONSTRAINT "PK_ledger_verification_results" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_ledger_verification_ranAt" ON "ledger_verification_results" ("ranAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_ledger_verification_ranAt"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ledger_verification_results"`);
    await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN IF EXISTS "txHash"`);
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "fee" TYPE numeric(18,8) USING "fee"::numeric`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ALTER COLUMN "amount" TYPE numeric(18,8) USING "amount"::numeric`,
    );
  }
}
