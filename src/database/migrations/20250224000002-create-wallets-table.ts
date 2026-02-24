import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateWalletsTable20250224000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'wallets',
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
            name: 'publicKey',
            type: 'varchar',
            length: '255',
            isUnique: true, // Unique constraint on public key
            isNullable: false,
          },
          {
            name: 'name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '50',
            default: "'active'",
            isNullable: false,
          },
          {
            name: 'type',
            type: 'varchar',
            length: '50',
            default: "'crypto'",
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
          {
            name: 'deletedAt',
            type: 'timestamptz',
            isNullable: true, // For soft deletes
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      'wallets',
      new TableIndex({
        name: 'idx_wallets_public_key',
        columnNames: ['publicKey'],
        isUnique: true, // Unique constraint on public key
      }),
    );

    await queryRunner.createIndex(
      'wallets',
      new TableIndex({
        name: 'idx_wallets_user_id',
        columnNames: ['userId'],
      }),
    );

    await queryRunner.createIndex(
      'wallets',
      new TableIndex({
        name: 'idx_wallets_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'wallets',
      new TableIndex({
        name: 'idx_wallets_deleted_at',
        columnNames: ['deletedAt'], // Index for soft deletes
      }),
    );

    // Add foreign key constraint to users table
    await queryRunner.query(`
      ALTER TABLE "wallets" 
      ADD CONSTRAINT "FK_wallets_userId" 
      FOREIGN KEY ("userId") REFERENCES "users"("id") 
      ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "wallets" DROP CONSTRAINT IF EXISTS "FK_wallets_userId"`);
    await queryRunner.dropTable('wallets');
  }
}