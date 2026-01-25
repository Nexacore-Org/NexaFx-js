import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateApiUsageLogs1706192400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'api_usage_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'route',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'method',
            type: 'varchar',
            length: '10',
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'durationMs',
            type: 'int',
          },
          {
            name: 'statusCode',
            type: 'int',
          },
          {
            name: 'userAgent',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'ipAddress',
            type: 'varchar',
            length: '45',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create indices
    await queryRunner.createIndex(
      'api_usage_logs',
      new TableIndex({
        name: 'idx_api_usage_route',
        columnNames: ['route'],
      }),
    );

    await queryRunner.createIndex(
      'api_usage_logs',
      new TableIndex({
        name: 'idx_api_usage_method',
        columnNames: ['method'],
      }),
    );

    await queryRunner.createIndex(
      'api_usage_logs',
      new TableIndex({
        name: 'idx_api_usage_user_id',
        columnNames: ['userId'],
      }),
    );

    await queryRunner.createIndex(
      'api_usage_logs',
      new TableIndex({
        name: 'idx_api_usage_created_at',
        columnNames: ['createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'api_usage_logs',
      new TableIndex({
        name: 'idx_api_usage_route_method',
        columnNames: ['route', 'method'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('api_usage_logs');
  }
}
