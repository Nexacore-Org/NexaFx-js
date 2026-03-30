import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateForwardContracts1700000000000 implements MigrationInterface {
  name = 'CreateForwardContracts1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the forward_contract_status enum type
    await queryRunner.query(`
      CREATE TYPE "public"."forward_contract_status_enum" AS ENUM (
        'ACTIVE',
        'SETTLED',
        'CANCELLED'
      )
    `);

    await queryRunner.createTable(
      new Table({
        name: 'forward_contracts',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'userId',             type: 'uuid',    isNullable: false },
          { name: 'baseCurrency',        type: 'varchar', length: '10' },
          { name: 'quoteCurrency',       type: 'varchar', length: '10' },
          // Immutable after insert — never updated by application code
          { name: 'lockedRate',          type: 'decimal', precision: 20, scale: 8 },
          { name: 'notionalAmount',      type: 'decimal', precision: 20, scale: 8 },
          { name: 'collateralAmount',    type: 'decimal', precision: 20, scale: 8 },
          { name: 'collateralCurrency',  type: 'varchar', length: '10' },
          { name: 'maturityDate',        type: 'timestamptz' },
          {
            name: 'status',
            type: 'enum',
            enumName: 'forward_contract_status_enum',
            default: "'ACTIVE'",
          },
          { name: 'cancellationFeeCharged', type: 'decimal', precision: 20, scale: 8, default: '0' },
          { name: 'settlementRate',      type: 'decimal', precision: 20, scale: 8, isNullable: true },
          { name: 'closedAt',            type: 'timestamptz', isNullable: true },
          { name: 'createdAt',           type: 'timestamptz', default: 'now()' },
          { name: 'updatedAt',           type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );

    // Index: look up contracts by user + status (common query pattern)
    await queryRunner.createIndex(
      'forward_contracts',
      new TableIndex({
        name: 'IDX_forward_contracts_user_status',
        columnNames: ['userId', 'status'],
      }),
    );

    // Index: exposure queries by currency pair + status
    await queryRunner.createIndex(
      'forward_contracts',
      new TableIndex({
        name: 'IDX_forward_contracts_pair_status',
        columnNames: ['baseCurrency', 'quoteCurrency', 'status'],
      }),
    );

    // Index: settlement cron — find ACTIVE contracts by maturity date
    await queryRunner.createIndex(
      'forward_contracts',
      new TableIndex({
        name: 'IDX_forward_contracts_maturity_status',
        columnNames: ['maturityDate', 'status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('forward_contracts');
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."forward_contract_status_enum"`,
    );
  }
}
