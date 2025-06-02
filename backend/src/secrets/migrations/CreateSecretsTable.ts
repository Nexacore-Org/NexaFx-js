import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreateSecretsTable1701234567890 implements MigrationInterface {
  name = 'CreateSecretsTable1701234567890';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create secrets table
    await queryRunner.createTable(
      new Table({
        name: 'secrets',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'value',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'type',
            type: 'enum',
            enum: [
              'API_KEY',
              'JWT_SECRET',
              'DATABASE_PASSWORD',
              'ENCRYPTION_KEY',
              'WEBHOOK_SECRET',
              'OAUTH_CLIENT_SECRET',
            ],
            isNullable: false,
          },
          {
            name: 'description',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'expiresAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'lastRotatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'rotationCount',
            type: 'integer',
            default: 0,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create affected_services table
    await queryRunner.createTable(
      new Table({
        name: 'affected_services',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'endpoint',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'authMethod',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'authHeader',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'authToken',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create junction table for many-to-many relationship
    await queryRunner.createTable(
      new Table({
        name: 'secret_affected_services',
        columns: [
          {
            name: 'secret_id',
            type: 'uuid',
          },
          {
            name: 'service_id',
            type: 'uuid',
          },
        ],
        foreignKeys: [
          {
            columnNames: ['secret_id'],
            referencedTableName: 'secrets',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
          {
            columnNames: ['service_id'],
            referencedTableName: 'affected_services',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
    );

    // Create indexes
    await queryRunner.createIndex(
      'secrets',
      new Index('IDX_SECRETS_NAME', ['name']),
    );

    await queryRunner.createIndex(
      'affected_services',
      new Index('IDX_AFFECTED_SERVICES_NAME', ['name']),
    );

    await queryRunner.createIndex(
      'secret_affected_services',
      new Index('IDX_SECRET_AFFECTED_SERVICES', ['secret_id', 'service_id']),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('secret_affected_services');
    await queryRunner.dropTable('affected_services');
    await queryRunner.dropTable('secrets');
  }
}