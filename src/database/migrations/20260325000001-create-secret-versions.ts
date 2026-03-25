import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateSecretVersions20260325000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'secret_versions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'type', type: 'varchar', length: '50', isNullable: false },
          { name: 'version', type: 'int', isNullable: false },
          { name: 'value', type: 'text', isNullable: false },
          { name: 'expiresAt', type: 'timestamp', isNullable: true },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'secret_versions',
      new TableIndex({
        name: 'idx_secret_versions_type_version',
        columnNames: ['type', 'version'],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      'secret_versions',
      new TableIndex({
        name: 'idx_secret_versions_type_expires_at',
        columnNames: ['type', 'expiresAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('secret_versions', true);
  }
}
