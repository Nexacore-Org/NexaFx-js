import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreateNotificationLogs1640995300000 implements MigrationInterface {
  name = 'CreateNotificationLogs1640995300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create notification_logs table
    await queryRunner.createTable(
      new Table({
        name: 'notification_logs',
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
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'notification_type',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'channel',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            isNullable: false,
            default: "'sent'",
          },
          {
            name: 'payload',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'error_message',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create indexes for optimal query performance
    await queryRunner.createIndex(
      'notification_logs',
      new Index('IDX_notification_logs_user_id', ['user_id']),
    );

    await queryRunner.createIndex(
      'notification_logs',
      new Index('IDX_notification_logs_notification_type', ['notification_type']),
    );

    await queryRunner.createIndex(
      'notification_logs',
      new Index('IDX_notification_logs_channel', ['channel']),
    );

    await queryRunner.createIndex(
      'notification_logs',
      new Index('IDX_notification_logs_status', ['status']),
    );

    // Composite indexes for common query patterns
    await queryRunner.createIndex(
      'notification_logs',
      new Index('IDX_notification_logs_user_created', ['user_id', 'created_at']),
    );

    await queryRunner.createIndex(
      'notification_logs',
      new Index('IDX_notification_logs_type_created', ['notification_type', 'created_at']),
    );

    await queryRunner.createIndex(
      'notification_logs',
      new Index('IDX_notification_logs_channel_status', ['channel', 'status']),
    );

    // Add constraint for status values
    await queryRunner.query(`
      ALTER TABLE "notification_logs" 
      ADD CONSTRAINT "CHK_notification_logs_status" 
      CHECK (status IN ('sent', 'failed', 'throttled'))
    `);

    // Add constraint for channel values
    await queryRunner.query(`
      ALTER TABLE "notification_logs" 
      ADD CONSTRAINT "CHK_notification_logs_channel" 
      CHECK (channel IS NULL OR channel IN ('in_app', 'push', 'sms', 'email', 'multi_channel'))
    `);

    // Create trigger for automatic cleanup (optional - can be handled by application)
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION cleanup_old_notification_logs()
      RETURNS TRIGGER AS $$
      BEGIN
        -- This trigger can be used for real-time cleanup if needed
        -- For now, cleanup is handled by the scheduled job
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop trigger function
    await queryRunner.query(`DROP FUNCTION IF EXISTS cleanup_old_notification_logs()`);

    // Drop constraints
    await queryRunner.query(`ALTER TABLE "notification_logs" DROP CONSTRAINT IF EXISTS "CHK_notification_logs_channel"`);
    await queryRunner.query(`ALTER TABLE "notification_logs" DROP CONSTRAINT IF EXISTS "CHK_notification_logs_status"`);

    // Drop indexes
    await queryRunner.dropIndex('notification_logs', 'IDX_notification_logs_channel_status');
    await queryRunner.dropIndex('notification_logs', 'IDX_notification_logs_type_created');
    await queryRunner.dropIndex('notification_logs', 'IDX_notification_logs_user_created');
    await queryRunner.dropIndex('notification_logs', 'IDX_notification_logs_status');
    await queryRunner.dropIndex('notification_logs', 'IDX_notification_logs_channel');
    await queryRunner.dropIndex('notification_logs', 'IDX_notification_logs_notification_type');
    await queryRunner.dropIndex('notification_logs', 'IDX_notification_logs_user_id');

    // Drop table
    await queryRunner.dropTable('notification_logs');
  }
}
