import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateLoginHistory1234567890123 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'login_history',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'userId',
            type: 'int',
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'ipAddress',
            type: 'varchar',
            length: '45',
          },
          {
            name: 'userAgent',
            type: 'text',
          },
          {
            name: 'isSuccessful',
            type: 'boolean',
            default: true,
          },
          {
            name: 'failureReason',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'location',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        indices: [
          {
            name: 'IDX_LOGIN_HISTORY_USER_ID',
            columnNames: ['userId'],
          },
          {
            name: 'IDX_LOGIN_HISTORY_EMAIL',
            columnNames: ['email'],
          },
          {
            name: 'IDX_LOGIN_HISTORY_CREATED_AT',
            columnNames: ['createdAt'],
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('login_history');
  }
}
