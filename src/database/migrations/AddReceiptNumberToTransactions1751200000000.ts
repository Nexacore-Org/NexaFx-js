import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReceiptNumberToTransactions1751200000000
  implements MigrationInterface
{
  name = 'AddReceiptNumberToTransactions1751200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE SEQUENCE IF NOT EXISTS transaction_receipt_seq START 1`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "receiptNumber" varchar(32) NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_transactions_receiptNumber" ON "transactions" ("receiptNumber") WHERE "receiptNumber" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_transactions_receiptNumber"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN IF EXISTS "receiptNumber"`,
    );
    await queryRunner.query(
      `DROP SEQUENCE IF EXISTS transaction_receipt_seq`,
    );
  }
}
