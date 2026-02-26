import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMultiSigApprovalWorkflow1700000000000 implements MigrationInterface {
  name = 'AddMultiSigApprovalWorkflow1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new status values to transaction status enum
    await queryRunner.query(`
      ALTER TYPE "transactions_status_enum"
      ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL'
    `);
    await queryRunner.query(`
      ALTER TYPE "transactions_status_enum"
      ADD VALUE IF NOT EXISTS 'APPROVED'
    `);
    await queryRunner.query(`
      ALTER TYPE "transactions_status_enum"
      ADD VALUE IF NOT EXISTS 'REJECTED'
    `);

    // Add approval tracking columns to transactions
    await queryRunner.query(`
      ALTER TABLE "transactions"
        ADD COLUMN IF NOT EXISTS "requiredApprovals"   INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "currentApprovals"    INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "requiresApproval"    BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS "rejectionReason"     TEXT
    `);

    // Create approval decision enum
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "transaction_approvals_decision_enum" AS ENUM ('APPROVED', 'REJECTED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$
    `);

    // Create transaction_approvals table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_approvals" (
        "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
        "transactionId" UUID NOT NULL,
        "approverId"    UUID NOT NULL,
        "approverEmail" VARCHAR(255),
        "approverRole"  VARCHAR(255),
        "decision"      "transaction_approvals_decision_enum" NOT NULL,
        "comment"       TEXT,
        "timestamp"     TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transaction_approvals" PRIMARY KEY ("id"),
        CONSTRAINT "FK_transaction_approvals_transaction"
          FOREIGN KEY ("transactionId")
          REFERENCES "transactions"("id")
          ON DELETE CASCADE
      )
    `);

    // Unique constraint: one action per approver per transaction
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_approval_transaction_approver"
        ON "transaction_approvals" ("transactionId", "approverId")
    `);

    // Index for fast lookup of pending approvals
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transactions_status_approval"
        ON "transactions" ("status")
        WHERE "status" = 'PENDING_APPROVAL'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_transactions_status_approval"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_approval_transaction_approver"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction_approvals"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "transaction_approvals_decision_enum"`);
    await queryRunner.query(`
      ALTER TABLE "transactions"
        DROP COLUMN IF EXISTS "requiredApprovals",
        DROP COLUMN IF EXISTS "currentApprovals",
        DROP COLUMN IF EXISTS "requiresApproval",
        DROP COLUMN IF EXISTS "rejectionReason"
    `);
  }
}
