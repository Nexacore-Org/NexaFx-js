import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateScheduledTransactions1711756800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'scheduled_transactions',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'userId', type: 'uuid' },
          { name: 'amount', type: 'decimal', precision: 18, scale: 8 },
          { name: 'currency', type: 'varchar', length: '3' },
          { name: 'targetCurrency', type: 'varchar', length: '3', isNullable: true },
          { name: 'description', type: 'varchar', length: '255', isNullable: true },
          { name: 'frequency', type: 'varchar', length: '20' },
          { name: 'status', type: 'varchar', length: '20', default: "'ACTIVE'" },
          { name: 'nextRunAt', type: 'timestamptz' },
          { name: 'consecutiveFailures', type: 'int', default: 0 },
          { name: 'maxConsecutiveFailures', type: 'int', default: 3 },
          { name: 'executionHistory', type: 'jsonb', isNullable: true },
          { name: 'metadata', type: 'jsonb', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'now()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex('scheduled_transactions', new TableIndex({ name: 'idx_sched_tx_user', columnNames: ['userId'] }));
    await queryRunner.createIndex('scheduled_transactions', new TableIndex({ name: 'idx_sched_tx_status_next', columnNames: ['status', 'nextRunAt'] }));
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('scheduled_transactions');
  }
}
