import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateFxAnalyticsTables1715200000000 implements MigrationInterface {
  name = 'CreateFxAnalyticsTables1715200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── rate_snapshots ────────────────────────────────────────────────────────
    await queryRunner.createTable(
      new Table({
        name: 'rate_snapshots',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'pair', type: 'varchar', length: '16', isNullable: false },
          { name: 'bucket_hour', type: 'timestamptz', isNullable: false },
          { name: 'open',  type: 'numeric', precision: 20, scale: 8, isNullable: false },
          { name: 'high',  type: 'numeric', precision: 20, scale: 8, isNullable: false },
          { name: 'low',   type: 'numeric', precision: 20, scale: 8, isNullable: false },
          { name: 'close', type: 'numeric', precision: 20, scale: 8, isNullable: false },
          { name: 'bid',   type: 'numeric', precision: 20, scale: 8, isNullable: false },
          { name: 'ask',   type: 'numeric', precision: 20, scale: 8, isNullable: false },
          { name: 'spread',     type: 'numeric', precision: 20, scale: 8, isNullable: false },
          { name: 'spread_pct', type: 'numeric', precision: 10, scale: 6, isNullable: false },
          { name: 'sample_count',    type: 'int', default: 0 },
          { name: 'confidence_score', type: 'numeric', precision: 5, scale: 4, default: '0' },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Unique constraint: one row per pair per hour
    await queryRunner.createIndex(
      'rate_snapshots',
      new TableIndex({
        name: 'UQ_rate_snapshots_pair_bucket',
        columnNames: ['pair', 'bucket_hour'],
        isUnique: true,
      }),
    );

    // Lookup index: pair + time range queries
    await queryRunner.createIndex(
      'rate_snapshots',
      new TableIndex({
        name: 'IDX_rate_snapshots_pair_bucket',
        columnNames: ['pair', 'bucket_hour'],
      }),
    );

    // ── provider_health_metrics ───────────────────────────────────────────────
    await queryRunner.createTable(
      new Table({
        name: 'provider_health_metrics',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'provider_name',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          { name: 'request_count_1h', type: 'int', default: 0 },
          { name: 'error_count_1h',   type: 'int', default: 0 },
          { name: 'total_requests',   type: 'bigint', default: 0 },
          { name: 'total_errors',     type: 'bigint', default: 0 },
          {
            name: 'avg_latency_ms',
            type: 'numeric',
            precision: 10,
            scale: 2,
            default: '0',
          },
          {
            name: 'circuit_breaker_state',
            type: 'enum',
            enum: ['CLOSED', 'OPEN', 'HALF_OPEN'],
            default: "'CLOSED'",
          },
          { name: 'last_tripped_at', type: 'timestamptz', isNullable: true },
          { name: 'last_success_at', type: 'timestamptz', isNullable: true },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'now()',
            onUpdate: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'provider_health_metrics',
      new TableIndex({
        name: 'UQ_provider_health_metrics_name',
        columnNames: ['provider_name'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('provider_health_metrics', true);
    await queryRunner.dropTable('rate_snapshots', true);
  }
}
