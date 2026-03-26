import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateUserSettings20260326000001 implements MigrationInterface {
  name = 'CreateUserSettings20260326000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user_settings',
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
            type: 'varchar',
            length: '255',
          },
          {
            name: 'display_currency',
            type: 'varchar',
            length: '10',
            default: "'USD'",
          },
          {
            name: 'language',
            type: 'varchar',
            length: '10',
            default: "'en'",
          },
          {
            name: 'timezone',
            type: 'varchar',
            length: '100',
            default: "'UTC'",
          },
          {
            name: 'email_notifications',
            type: 'boolean',
            default: true,
          },
          {
            name: 'sms_notifications',
            type: 'boolean',
            default: false,
          },
          {
            name: 'push_notifications',
            type: 'boolean',
            default: true,
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
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'user_settings',
      new TableIndex({
        name: 'idx_user_settings_user_id',
        columnNames: ['user_id'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('user_settings', 'idx_user_settings_user_id');
    await queryRunner.dropTable('user_settings');
  }
}
