import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionFtsIndexXXXXXX implements MigrationInterface {
  name = 'AddTransactionFtsIndexXXXXXX';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) Add generated tsvector column
    await queryRunner.query(`
      ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS search_vector tsvector
      GENERATED ALWAYS AS (
        to_tsvector(
          'simple',
          coalesce(reference, '') || ' ' ||
          coalesce(id::text, '') || ' ' ||
          coalesce(status, '') || ' ' ||
          coalesce(currency, '') || ' ' ||
          coalesce(sender_name, '') || ' ' ||
          coalesce(sender_email, '') || ' ' ||
          coalesce(recipient_name, '') || ' ' ||
          coalesce(recipient_email, '') || ' ' ||
          coalesce(description, '')
        )
      ) STORED;
    `);

    // 2) Create GIN index for fast search
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_transactions_search_vector
      ON transactions
      USING GIN (search_vector);
    `);

    // 3) Helpful indexes for filters/sorting
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_transactions_created_at
      ON transactions (created_at DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_transactions_status_currency
      ON transactions (status, currency);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_transactions_status_currency;`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_transactions_created_at;`);
    await queryRunner.query(`DROP INDEX IF EXISTS IDX_transactions_search_vector;`);
    await queryRunner.query(`ALTER TABLE transactions DROP COLUMN IF EXISTS search_vector;`);
  }
}
