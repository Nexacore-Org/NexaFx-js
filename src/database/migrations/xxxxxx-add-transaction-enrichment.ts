import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransactionEnrichmentXXXXXX implements MigrationInterface {
  name = 'AddTransactionEnrichmentXXXXXX';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS "enrichmentMetadata" jsonb;
    `);

    await queryRunner.query(`
      ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS "enrichmentUpdatedAt" TIMESTAMPTZ;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE transactions DROP COLUMN IF EXISTS "enrichmentUpdatedAt";`,
    );
    await queryRunner.query(
      `ALTER TABLE transactions DROP COLUMN IF EXISTS "enrichmentMetadata";`,
    );
  }
}
