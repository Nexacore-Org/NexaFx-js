import { MigrationInterface, QueryRunner } from 'typeorm';

/** Composite indexes for the bounded statement queries. */
export class AddStatementIndexes1754200000000 implements MigrationInterface {
  name = 'AddStatementIndexes1754200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transactions_sender_currency_created"
      ON "transactions" ("senderId", "currency", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transactions_receiver_currency_created"
      ON "transactions" ("receiverId", "currency", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_fx_trades_user_executed"
      ON "fx_trades" ("userId", "executedAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_fx_trades_user_executed"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_transactions_receiver_currency_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_transactions_sender_currency_created"`,
    );
  }
}
