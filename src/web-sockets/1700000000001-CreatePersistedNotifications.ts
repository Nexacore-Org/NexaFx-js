import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreatePersistedNotifications1700000000001 implements MigrationInterface {
  name = 'CreatePersistedNotifications1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'persisted_notifications',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'userId',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'event',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'payload',
            type: 'jsonb',
          },
          {
            name: 'delivered',
            type: 'boolean',
            default: false,
          },
          {
            name: 'deliveryAttempts',
            type: 'int',
            default: 0,
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'now()',
          },
          {
            name: 'deliveredAt',
            type: 'timestamptz',
            isNullable: true,
          },
          {
            name: 'expiresAt',
            type: 'timestamptz',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'persisted_notifications',
      new Index({
        name: 'IDX_persisted_notifications_userId_createdAt',
        columnNames: ['userId', 'createdAt'],
      }),
    );

    await queryRunner.createIndex(
      'persisted_notifications',
      new Index({
        name: 'IDX_persisted_notifications_userId_delivered',
        columnNames: ['userId', 'delivered'],
      }),
    );

    await queryRunner.createIndex(
      'persisted_notifications',
      new Index({
        name: 'IDX_persisted_notifications_expiresAt',
        columnNames: ['expiresAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('persisted_notifications');
  }
}
