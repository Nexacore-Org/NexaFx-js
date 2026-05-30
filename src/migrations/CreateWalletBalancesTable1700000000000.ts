import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateWalletBalancesTable1700000000000 implements MigrationInterface {
  name = 'CreateWalletBalancesTable1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'wallet_balances',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'uuid',
          },
          {
            name: 'account_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'currency',
            type: 'varchar',
            length: '3',
            isNullable: false,
          },
          {
            name: 'balance',
            type: 'decimal',
            precision: 20,
            scale: 2,
            default: "'0'",
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'version',
            type: 'int',
            isNullable: false,
            default: 1,
          },
        ],
        uniques: [
          {
            columnNames: ['account_id', 'currency'],
            name: 'UQ_wallet_account_currency',
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('wallet_balances');
  }
}
