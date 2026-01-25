import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateRateLimitRulesXXXXXX implements MigrationInterface {
  name = 'CreateRateLimitRulesXXXXXX';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create rate_limit_rules table
    await queryRunner.createTable(
      new Table({
        name: 'rate_limit_rules',
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
            length: '50',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'tier',
            type: 'varchar',
            length: '20',
          },
          {
            name: 'riskLevel',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'maxRequests',
            type: 'int',
          },
          {
            name: 'windowSeconds',
            type: 'int',
          },
          {
            name: 'routePattern',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'method',
            type: 'varchar',
            length: '10',
            isNullable: true,
          },
          {
            name: 'priority',
            type: 'int',
            default: 0,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
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
          },
        ],
      }),
      true,
    );

    // Create indices for rate_limit_rules
    await queryRunner.createIndex(
      'rate_limit_rules',
      new TableIndex({
        name: 'idx_rate_limit_rule_tier',
        columnNames: ['tier'],
      }),
    );

    await queryRunner.createIndex(
      'rate_limit_rules',
      new TableIndex({
        name: 'idx_rate_limit_rule_active',
        columnNames: ['isActive'],
      }),
    );

    await queryRunner.createIndex(
      'rate_limit_rules',
      new TableIndex({
        name: 'idx_rate_limit_rule_priority',
        columnNames: ['priority'],
      }),
    );

    // Create rate_limit_trackers table
    await queryRunner.createTable(
      new Table({
        name: 'rate_limit_trackers',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'trackerKey',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'userId',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'ipAddress',
            type: 'varchar',
            length: '45',
            isNullable: true,
          },
          {
            name: 'ruleId',
            type: 'uuid',
          },
          {
            name: 'requestCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'expiresAt',
            type: 'timestamptz',
          },
          {
            name: 'windowStart',
            type: 'timestamptz',
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
          },
        ],
      }),
      true,
    );

    // Create indices for rate_limit_trackers
    await queryRunner.createIndex(
      'rate_limit_trackers',
      new TableIndex({
        name: 'idx_rate_limit_tracker_key',
        columnNames: ['trackerKey'],
      }),
    );

    await queryRunner.createIndex(
      'rate_limit_trackers',
      new TableIndex({
        name: 'idx_rate_limit_tracker_expires',
        columnNames: ['expiresAt'],
      }),
    );

    await queryRunner.createIndex(
      'rate_limit_trackers',
      new TableIndex({
        name: 'idx_rate_limit_tracker_user',
        columnNames: ['userId'],
      }),
    );

    await queryRunner.createIndex(
      'rate_limit_trackers',
      new TableIndex({
        name: 'idx_rate_limit_tracker_rule',
        columnNames: ['ruleId'],
      }),
    );

    // Create unique index for tracker key + rule combination
    await queryRunner.createIndex(
      'rate_limit_trackers',
      new TableIndex({
        name: 'idx_rate_limit_tracker_unique',
        columnNames: ['trackerKey', 'ruleId'],
        isUnique: true,
      }),
    );

    // Insert default rate limit rules
    await queryRunner.query(`
      INSERT INTO rate_limit_rules (name, description, tier, maxRequests, windowSeconds, priority, "isActive")
      VALUES
        ('Guest Default', 'Default rate limit for guest users', 'guest', 100, 3600, 0, true),
        ('Standard Default', 'Default rate limit for standard tier users', 'standard', 1000, 3600, 0, true),
        ('Premium Default', 'Default rate limit for premium tier users', 'premium', 10000, 3600, 0, true),
        ('Admin Default', 'Default rate limit for admin users', 'admin', 100000, 3600, 0, true),
        ('Guest Risky', 'Stricter rate limit for risky guest users', 'guest', 20, 3600, 10, true),
        ('Standard Risky', 'Stricter rate limit for risky standard users', 'standard', 200, 3600, 10, true);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('rate_limit_trackers');
    await queryRunner.dropTable('rate_limit_rules');
  }
}
