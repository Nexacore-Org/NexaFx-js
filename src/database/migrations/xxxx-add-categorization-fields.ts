import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategorizationFields1680000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transactions
      ADD COLUMN "categoryConfidence" varchar NULL,
      ADD COLUMN "categoryAutoAssigned" boolean DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transactions
      DROP COLUMN "categoryConfidence",
      DROP COLUMN "categoryAutoAssigned"
    `);
  }
}