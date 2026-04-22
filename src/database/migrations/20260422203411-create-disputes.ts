import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateDisputes20260422203411 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'disputes',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'subjectType',
            type: 'varchar',
            length: '50',
          },
          {
            name: 'subjectId',
            type: 'uuid',
          },
          {
            name: 'initiatorUserId',
            type: 'uuid',
          },
          {
            name: 'counterpartyUserId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'OPEN'",
          },
          {
            name: 'reason',
            type: 'text',
          },
          {
            name: 'resolutionNote',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'evidenceFileIds',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'resolvedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'autoCloseAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
    );

    await queryRunner.createIndex(
      'disputes',
      new TableIndex({
        name: 'idx_disputes_subject',
        columnNames: ['subjectType', 'subjectId'],
      }),
    );

    await queryRunner.createIndex(
      'disputes',
      new TableIndex({
        name: 'idx_disputes_initiator',
        columnNames: ['initiatorUserId'],
      }),
    );

    await queryRunner.createIndex(
      'disputes',
      new TableIndex({
        name: 'idx_disputes_status',
        columnNames: ['status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('disputes');
  }
}