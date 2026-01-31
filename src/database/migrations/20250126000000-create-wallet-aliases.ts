import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreateWalletAliases20250126000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'wallet_aliases',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'walletAddress',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'alias',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
          {
            name: 'updatedAt',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      'wallet_aliases',
      new Index('idx_wallet_alias_user_id', ['userId']),
    );

    await queryRunner.createIndex(
      'wallet_aliases',
      new Index('idx_wallet_alias_wallet_address', ['walletAddress']),
    );

    await queryRunner.createIndex(
      'wallet_aliases',
      new Index('idx_wallet_alias_user_wallet', ['userId', 'walletAddress'], {
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('wallet_aliases');
  }
}