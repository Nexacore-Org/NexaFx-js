import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDataArchiveSchema20260224000000
  implements MigrationInterface
{
  name = 'CreateDataArchiveSchema20260224000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS archive`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS archive.transactions_archive (
        id BIGSERIAL PRIMARY KEY,
        original_id uuid UNIQUE NOT NULL,
        source_created_at TIMESTAMPTZ NOT NULL,
        data JSONB NOT NULL,
        archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_archive_transactions_source_created_at
      ON archive.transactions_archive (source_created_at)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_archive_transactions_archived_at
      ON archive.transactions_archive (archived_at)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS archive.transaction_execution_snapshots_archive (
        id BIGSERIAL PRIMARY KEY,
        original_id uuid UNIQUE NOT NULL,
        source_created_at TIMESTAMPTZ NOT NULL,
        data JSONB NOT NULL,
        archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_archive_snapshots_source_created_at
      ON archive.transaction_execution_snapshots_archive (source_created_at)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_archive_snapshots_archived_at
      ON archive.transaction_execution_snapshots_archive (archived_at)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS archive.transaction_risks_archive (
        id BIGSERIAL PRIMARY KEY,
        original_id uuid UNIQUE NOT NULL,
        source_created_at TIMESTAMPTZ NOT NULL,
        data JSONB NOT NULL,
        archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_archive_transaction_risks_source_created_at
      ON archive.transaction_risks_archive (source_created_at)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_archive_transaction_risks_archived_at
      ON archive.transaction_risks_archive (archived_at)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS archive.api_usage_logs_archive (
        id BIGSERIAL PRIMARY KEY,
        original_id uuid UNIQUE NOT NULL,
        source_created_at TIMESTAMPTZ NOT NULL,
        data JSONB NOT NULL,
        archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_archive_api_usage_logs_source_created_at
      ON archive.api_usage_logs_archive (source_created_at)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_archive_api_usage_logs_archived_at
      ON archive.api_usage_logs_archive (archived_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS archive CASCADE`);
  }
}
