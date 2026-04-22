import { MigrationInterface, QueryRunner, Table, Index, Unique } from 'typeorm';

export class CreateScheduledTransactions1640995400000 implements MigrationInterface {
  name = 'CreateScheduledTransactions1640995400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create scheduled_transactions table
    await queryRunner.createTable(
      new Table({
        name: 'scheduled_transactions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 18,
            scale: 8,
            isNullable: false,
          },
          {
            name: 'currency',
            type: 'varchar',
            length: '3',
            isNullable: false,
          },
          {
            name: 'target_currency',
            type: 'varchar',
            length: '3',
            isNullable: true,
          },
          {
            name: 'description',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'frequency',
            type: 'varchar',
            length: '20',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            isNullable: false,
            default: "'ACTIVE'",
          },
          {
            name: 'next_run_at',
            type: 'timestamptz',
            isNullable: false,
          },
          {
            name: 'consecutive_failures',
            type: 'int',
            isNullable: false,
            default: 0,
          },
          {
            name: 'max_consecutive_failures',
            type: 'int',
            isNullable: false,
            default: 3,
          },
          {
            name: 'execution_history',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create indexes for optimal query performance
    await queryRunner.createIndex(
      'scheduled_transactions',
      new Index('idx_sched_tx_user', ['user_id']),
    );

    await queryRunner.createIndex(
      'scheduled_transactions',
      new Index('idx_sched_tx_status_next', ['status', 'next_run_at']),
    );

    await queryRunner.createIndex(
      'scheduled_transactions',
      new Index('idx_sched_tx_frequency', ['frequency']),
    );

    await queryRunner.createIndex(
      'scheduled_transactions',
      new Index('idx_sched_tx_next_run', ['next_run_at']),
    );

    await queryRunner.createIndex(
      'scheduled_transactions',
      new Index('idx_sched_tx_created_at', ['created_at']),
    );

    // Add constraints for enum values
    await queryRunner.query(`
      ALTER TABLE "scheduled_transactions" 
      ADD CONSTRAINT "CHK_scheduled_tx_frequency" 
      CHECK (frequency IN ('DAILY', 'WEEKLY', 'MONTHLY'))
    `);

    await queryRunner.query(`
      ALTER TABLE "scheduled_transactions" 
      ADD CONSTRAINT "CHK_scheduled_tx_status" 
      CHECK (status IN ('ACTIVE', 'PAUSED', 'SUSPENDED', 'CANCELLED'))
    `);

    await queryRunner.query(`
      ALTER TABLE "scheduled_transactions" 
      ADD CONSTRAINT "CHK_scheduled_tx_failures" 
      CHECK (consecutive_failures >= 0 AND consecutive_failures <= max_consecutive_failures)
    `);

    await queryRunner.query(`
      ALTER TABLE "scheduled_transactions" 
      ADD CONSTRAINT "CHK_scheduled_tx_amount" 
      CHECK (amount > 0)
    `);

    // Add currency format validation
    await queryRunner.query(`
      ALTER TABLE "scheduled_transactions" 
      ADD CONSTRAINT "CHK_scheduled_tx_currency" 
      CHECK (currency ~ '^[A-Z]{3}$')
    `);

    await queryRunner.query(`
      ALTER TABLE "scheduled_transactions" 
      ADD CONSTRAINT "CHK_scheduled_tx_target_currency" 
      CHECK (target_currency IS NULL OR target_currency ~ '^[A-Z]{3}$')
    `);

    // Create trigger to update updated_at timestamp
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_scheduled_transactions_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TRIGGER "TRG_scheduled_transactions_updated_at"
      BEFORE UPDATE ON "scheduled_transactions"
      FOR EACH ROW EXECUTE FUNCTION update_scheduled_transactions_updated_at();
    `);

    // Create trigger for automatic next_run_at calculation when frequency changes
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_next_run_at_on_frequency_change()
      RETURNS TRIGGER AS $$
      BEGIN
        IF OLD.frequency IS DISTINCT FROM NEW.frequency THEN
          NEW.next_run_at = CASE 
            WHEN NEW.frequency = 'DAILY' THEN CURRENT_DATE + INTERVAL '1 day'
            WHEN NEW.frequency = 'WEEKLY' THEN CURRENT_DATE + INTERVAL '1 week'
            WHEN NEW.frequency = 'MONTHLY' THEN CURRENT_DATE + INTERVAL '1 month'
            ELSE NEW.next_run_at
          END;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TRIGGER "TRG_scheduled_transactions_frequency_change"
      BEFORE UPDATE OF frequency ON "scheduled_transactions"
      FOR EACH ROW EXECUTE FUNCTION update_next_run_at_on_frequency_change();
    `);

    // Create trigger for automatic suspension after max failures
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION auto_suspend_on_max_failures()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.consecutive_failures >= NEW.max_consecutive_failures AND NEW.status = 'ACTIVE' THEN
          NEW.status = 'SUSPENDED';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TRIGGER "TRG_scheduled_transactions_auto_suspend"
      BEFORE UPDATE OF consecutive_failures ON "scheduled_transactions"
      FOR EACH ROW EXECUTE FUNCTION auto_suspend_on_max_failures();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop triggers
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_scheduled_transactions_auto_suspend" ON "scheduled_transactions"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_scheduled_transactions_frequency_change" ON "scheduled_transactions"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_scheduled_transactions_updated_at" ON "scheduled_transactions"`);
    
    await queryRunner.query(`DROP FUNCTION IF EXISTS auto_suspend_on_max_failures()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS update_next_run_at_on_frequency_change()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS update_scheduled_transactions_updated_at()`);

    // Drop constraints
    await queryRunner.query(`ALTER TABLE "scheduled_transactions" DROP CONSTRAINT IF EXISTS "CHK_scheduled_tx_target_currency"`);
    await queryRunner.query(`ALTER TABLE "scheduled_transactions" DROP CONSTRAINT IF EXISTS "CHK_scheduled_tx_currency"`);
    await queryRunner.query(`ALTER TABLE "scheduled_transactions" DROP CONSTRAINT IF EXISTS "CHK_scheduled_tx_amount"`);
    await queryRunner.query(`ALTER TABLE "scheduled_transactions" DROP CONSTRAINT IF EXISTS "CHK_scheduled_tx_failures"`);
    await queryRunner.query(`ALTER TABLE "scheduled_transactions" DROP CONSTRAINT IF EXISTS "CHK_scheduled_tx_status"`);
    await queryRunner.query(`ALTER TABLE "scheduled_transactions" DROP CONSTRAINT IF EXISTS "CHK_scheduled_tx_frequency"`);

    // Drop indexes
    await queryRunner.dropIndex('scheduled_transactions', 'idx_sched_tx_created_at');
    await queryRunner.dropIndex('scheduled_transactions', 'idx_sched_tx_next_run');
    await queryRunner.dropIndex('scheduled_transactions', 'idx_sched_tx_frequency');
    await queryRunner.dropIndex('scheduled_transactions', 'idx_sched_tx_status_next');
    await queryRunner.dropIndex('scheduled_transactions', 'idx_sched_tx_user');

    // Drop table
    await queryRunner.dropTable('scheduled_transactions');
  }
}
