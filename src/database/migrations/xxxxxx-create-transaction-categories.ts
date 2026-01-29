import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionCategoriesXXXXXX implements MigrationInterface {
  name = 'CreateTransactionCategoriesXXXXXX';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create transaction_categories table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "transaction_categories" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(100) UNIQUE NOT NULL,
        "description" text,
        "keywords" jsonb,
        "merchantTags" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transaction_categories_name"
      ON "transaction_categories" ("name");
    `);

    // Add categoryId column to transactions table
    await queryRunner.query(`
      ALTER TABLE "transactions"
      ADD COLUMN IF NOT EXISTS "categoryId" uuid REFERENCES "transaction_categories"("id") ON DELETE SET NULL;
    `);

    // Create index for foreign key
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_transactions_categoryId"
      ON "transactions" ("categoryId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign key constraint and column
    await queryRunner.query(`
      ALTER TABLE "transactions" DROP COLUMN IF EXISTS "categoryId";
    `);

    // Drop table
    await queryRunner.query(`
      DROP TABLE IF EXISTS "transaction_categories";
    `);
  }
}
