import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateAnnouncementsTable1234567890123 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'announcements',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'title',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'body',
            type: 'text',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['draft', 'published', 'archived'],
            default: "'draft'",
          },
          {
            name: 'publishAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'expiresAt',
            type: 'timestamp',
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

    // Create indexes for better query performance
    await queryRunner.createIndex(
      'announcements',
      new TableIndex({
        name: 'IDX_announcements_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createIndex(
      'announcements',
      new TableIndex({
        name: 'IDX_announcements_publishAt',
        columnNames: ['publishAt'],
      }),
    );

    await queryRunner.createIndex(
      'announcements',
      new TableIndex({
        name: 'IDX_announcements_expiresAt',
        columnNames: ['expiresAt'],
      }),
    );

    // Composite index for active announcements query
    await queryRunner.createIndex(
      'announcements',
      new TableIndex({
        name: 'IDX_announcements_active',
        columnNames: ['status', 'publishAt', 'expiresAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('announcements');
  }
}