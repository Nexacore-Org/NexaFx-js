import { MigrationInterface, QueryRunner, Table, Index, Unique } from 'typeorm';

export class CreateTransactionAnnotations1640995200000 implements MigrationInterface {
  name = 'CreateTransactionAnnotations1640995200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create transaction_notes table
    await queryRunner.createTable(
      new Table({
        name: 'transaction_notes',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'transactionId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'content',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'searchVector',
            type: 'tsvector',
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
        foreignKeys: [
          {
            columnNames: ['transactionId'],
            referencedTableName: 'transactions',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    // Create transaction_tags table
    await queryRunner.createTable(
      new Table({
        name: 'transaction_tags',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'transactionId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'tag',
            type: 'varchar',
            length: '50',
            isNullable: false,
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
        foreignKeys: [
          {
            columnNames: ['transactionId'],
            referencedTableName: 'transactions',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
        uniques: [
          new Unique({
            name: 'UQ_transaction_tags_transaction_user_tag',
            columnNames: ['transactionId', 'userId', 'tag'],
          }),
        ],
      }),
      true,
    );

    // Create indexes for transaction_notes
    await queryRunner.createIndex(
      'transaction_notes',
      new Index('IDX_transaction_notes_transaction_id', ['transactionId']),
    );
    await queryRunner.createIndex(
      'transaction_notes',
      new Index('IDX_transaction_notes_user_id', ['userId']),
    );
    await queryRunner.createIndex(
      'transaction_notes',
      new Index('IDX_transaction_notes_created_at', ['createdAt']),
    );

    // Create indexes for transaction_tags
    await queryRunner.createIndex(
      'transaction_tags',
      new Index('IDX_transaction_tags_transaction_id', ['transactionId']),
    );
    await queryRunner.createIndex(
      'transaction_tags',
      new Index('IDX_transaction_tags_user_id', ['userId']),
    );
    await queryRunner.createIndex(
      'transaction_tags',
      new Index('IDX_transaction_tags_tag', ['tag']),
    );
    await queryRunner.createIndex(
      'transaction_tags',
      new Index('IDX_transaction_tags_user_tag', ['userId', 'tag']),
    );

    // Create full-text search index for notes
    await queryRunner.query(`
      CREATE INDEX "IDX_transaction_notes_search_vector" 
      ON "transaction_notes" USING GIN ("searchVector")
    `);

    // Create trigger to update searchVector for notes
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_transaction_notes_search_vector()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.searchVector := to_tsvector('english', NEW.content);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TRIGGER "TRG_transaction_notes_search_vector"
      BEFORE INSERT OR UPDATE ON "transaction_notes"
      FOR EACH ROW EXECUTE FUNCTION update_transaction_notes_search_vector();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop triggers
    await queryRunner.query(`DROP TRIGGER IF EXISTS "TRG_transaction_notes_search_vector" ON "transaction_notes"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS update_transaction_notes_search_vector()`);

    // Drop indexes
    await queryRunner.dropIndex('transaction_notes', 'IDX_transaction_notes_search_vector');
    await queryRunner.dropIndex('transaction_notes', 'IDX_transaction_notes_created_at');
    await queryRunner.dropIndex('transaction_notes', 'IDX_transaction_notes_user_id');
    await queryRunner.dropIndex('transaction_notes', 'IDX_transaction_notes_transaction_id');
    
    await queryRunner.dropIndex('transaction_tags', 'IDX_transaction_tags_user_tag');
    await queryRunner.dropIndex('transaction_tags', 'IDX_transaction_tags_tag');
    await queryRunner.dropIndex('transaction_tags', 'IDX_transaction_tags_user_id');
    await queryRunner.dropIndex('transaction_tags', 'IDX_transaction_tags_transaction_id');

    // Drop tables
    await queryRunner.dropTable('transaction_tags');
    await queryRunner.dropTable('transaction_notes');
  }
}
