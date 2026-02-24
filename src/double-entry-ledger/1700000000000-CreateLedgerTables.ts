import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateLedgerTables1700000000000 implements MigrationInterface {
  name = 'CreateLedgerTables1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create ENUM types
    await queryRunner.query(`CREATE TYPE "ledger_entries_entry_type_enum" AS ENUM('DEBIT', 'CREDIT')`);
    await queryRunner.query(
      `CREATE TYPE "ledger_accounts_account_type_enum" AS ENUM('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')`,
    );

    // Create ledger_accounts table
    await queryRunner.createTable(
      new Table({
        name: 'ledger_accounts',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'user_id', type: 'uuid', isNullable: true },
          { name: 'account_type', type: 'ledger_accounts_account_type_enum' },
          { name: 'currency', type: 'varchar', length: '10' },
          { name: 'name', type: 'varchar', length: '100' },
          { name: 'derived_balance', type: 'decimal', precision: 20, scale: 8, default: '0' },
          { name: 'is_system_account', type: 'boolean', default: false },
          { name: 'version', type: 'integer', default: 1 },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
          { name: 'updated_at', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );

    // Create ledger_entries table
    await queryRunner.createTable(
      new Table({
        name: 'ledger_entries',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'transaction_id', type: 'uuid' },
          { name: 'account_id', type: 'uuid' },
          { name: 'debit', type: 'decimal', precision: 20, scale: 8, default: '0' },
          { name: 'credit', type: 'decimal', precision: 20, scale: 8, default: '0' },
          { name: 'currency', type: 'varchar', length: '10' },
          { name: 'entry_type', type: 'ledger_entries_entry_type_enum' },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'metadata', type: 'jsonb', isNullable: true },
          { name: 'checksum', type: 'varchar', length: '64' },
          { name: 'timestamp', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );

    // Indexes
    await queryRunner.createIndex('ledger_entries', new TableIndex({ name: 'IDX_LEDGER_ENTRIES_TX_ID', columnNames: ['transaction_id'] }));
    await queryRunner.createIndex('ledger_entries', new TableIndex({ name: 'IDX_LEDGER_ENTRIES_ACCOUNT_ID', columnNames: ['account_id'] }));
    await queryRunner.createIndex('ledger_entries', new TableIndex({ name: 'IDX_LEDGER_ENTRIES_CURRENCY', columnNames: ['currency'] }));
    await queryRunner.createIndex('ledger_entries', new TableIndex({ name: 'IDX_LEDGER_ENTRIES_TIMESTAMP', columnNames: ['timestamp'] }));
    await queryRunner.createIndex('ledger_accounts', new TableIndex({ name: 'IDX_LEDGER_ACCOUNTS_USER_ID', columnNames: ['user_id'] }));
    await queryRunner.createIndex('ledger_accounts', new TableIndex({ name: 'IDX_LEDGER_ACCOUNTS_CURRENCY', columnNames: ['currency'] }));

    // Row-level security: prevent UPDATE/DELETE on ledger_entries
    await queryRunner.query(`
      CREATE RULE ledger_entries_no_update AS ON UPDATE TO ledger_entries DO INSTEAD NOTHING;
    `);
    await queryRunner.query(`
      CREATE RULE ledger_entries_no_delete AS ON DELETE TO ledger_entries DO INSTEAD NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP RULE IF EXISTS ledger_entries_no_delete ON ledger_entries`);
    await queryRunner.query(`DROP RULE IF EXISTS ledger_entries_no_update ON ledger_entries`);
    await queryRunner.dropTable('ledger_entries');
    await queryRunner.dropTable('ledger_accounts');
    await queryRunner.query(`DROP TYPE "ledger_entries_entry_type_enum"`);
    await queryRunner.query(`DROP TYPE "ledger_accounts_account_type_enum"`);
  }
}
