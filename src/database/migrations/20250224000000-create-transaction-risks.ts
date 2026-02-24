import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionRisks20250224000000 implements MigrationInterface {
  name = 'CreateTransactionRisks20250224000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create transaction_risks table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_risks" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "transactionId" uuid NOT NULL UNIQUE,
        "riskScore" int NOT NULL DEFAULT 0,
        "riskLevel" varchar(20) NOT NULL DEFAULT 'LOW',
        "isFlagged" boolean NOT NULL DEFAULT false,
        "flagReason" varchar(50),
        "riskFactors" jsonb NOT NULL DEFAULT '[]',
        "evaluationHistory" jsonb NOT NULL DEFAULT '[]',
        "riskEvaluatedAt" timestamp,
        "flaggedAt" timestamp,
        "flaggedBy" uuid,
        "adminNotes" varchar(500),
        "reviewStatus" varchar(50) NOT NULL DEFAULT 'PENDING_REVIEW',
        "reviewedAt" timestamp,
        "reviewedBy" uuid,
        "autoProcessed" boolean NOT NULL DEFAULT false,
        "velocityData" jsonb,
        "deviceContext" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_transaction_risks_transaction" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE
      );
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_transaction_risks_score" ON "transaction_risks" ("riskScore");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_transaction_risks_flagged" ON "transaction_risks" ("isFlagged");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_transaction_risks_level" ON "transaction_risks" ("riskLevel");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_transaction_risks_review_status" ON "transaction_risks" ("reviewStatus");
    `);

    // Add risk-related columns to transactions table
    await queryRunner.query(`
      ALTER TABLE "transactions" 
      ADD COLUMN IF NOT EXISTS "riskScore" int DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "isFlagged" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "riskEvaluatedAt" timestamp,
      ADD COLUMN IF NOT EXISTS "requiresManualReview" boolean DEFAULT false;
    `);

    // Create index on transactions for flagged status
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_transactions_flagged" ON "transactions" ("isFlagged") WHERE "isFlagged" = true;
    `);

    // Create index on transactions for risk score
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_transactions_risk_score" ON "transactions" ("riskScore");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove indexes from transactions
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_transactions_risk_score"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_transactions_flagged"`);

    // Remove columns from transactions
    await queryRunner.query(`
      ALTER TABLE "transactions" 
      DROP COLUMN IF EXISTS "riskScore",
      DROP COLUMN IF EXISTS "isFlagged",
      DROP COLUMN IF EXISTS "riskEvaluatedAt",
      DROP COLUMN IF EXISTS "requiresManualReview";
    `);

    // Drop transaction_risks table (indexes will be dropped automatically)
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction_risks"`);
  }
}
