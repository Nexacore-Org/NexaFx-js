import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateComplianceTables1700000000000 implements MigrationInterface {
  name = 'CreateComplianceTables1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE report_type_enum AS ENUM (
        'transaction_summary',
        'flagged_transactions',
        'user_activity',
        'audit_snapshot'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE export_format_enum AS ENUM ('csv', 'json')
    `);

    await queryRunner.query(`
      CREATE TYPE report_status_enum AS ENUM (
        'pending', 'processing', 'completed', 'failed'
      )
    `);

    await queryRunner.createTable(
      new Table({
        name: 'compliance_reports',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'reportType', type: 'report_type_enum' },
          { name: 'exportFormat', type: 'export_format_enum' },
          { name: 'status', type: 'report_status_enum', default: "'pending'" },
          { name: 'requestedBy', type: 'uuid' },
          { name: 'filters', type: 'jsonb', isNullable: true },
          { name: 'reportData', type: 'jsonb', isNullable: true },
          { name: 'exportPath', type: 'varchar', isNullable: true },
          { name: 'checksum', type: 'varchar', isNullable: true },
          { name: 'recordCount', type: 'int', isNullable: true },
          { name: 'errorMessage', type: 'text', isNullable: true },
          { name: 'completedAt', type: 'timestamptz', isNullable: true },
          { name: 'createdAt', type: 'timestamptz', default: 'NOW()' },
          { name: 'updatedAt', type: 'timestamptz', default: 'NOW()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'compliance_reports',
      new TableIndex({ name: 'IDX_compliance_reports_type_created', columnNames: ['reportType', 'createdAt'] }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'audit_evidence_logs',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'actorId', type: 'varchar' },
          { name: 'actorRole', type: 'varchar' },
          { name: 'action', type: 'varchar' },
          { name: 'entityType', type: 'varchar' },
          { name: 'entityId', type: 'varchar', isNullable: true },
          { name: 'before', type: 'jsonb', isNullable: true },
          { name: 'after', type: 'jsonb', isNullable: true },
          { name: 'ipAddress', type: 'varchar', isNullable: true },
          { name: 'userAgent', type: 'varchar', isNullable: true },
          { name: 'integrityHash', type: 'varchar' },
          { name: 'createdAt', type: 'timestamptz', default: 'NOW()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'audit_evidence_logs',
      new TableIndex({ name: 'IDX_audit_evidence_entity', columnNames: ['entityType', 'entityId'] }),
    );

    await queryRunner.createIndex(
      'audit_evidence_logs',
      new TableIndex({ name: 'IDX_audit_evidence_actor', columnNames: ['actorId'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('audit_evidence_logs', true);
    await queryRunner.dropTable('compliance_reports', true);
    await queryRunner.query(`DROP TYPE IF EXISTS report_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS export_format_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS report_type_enum`);
  }
}
