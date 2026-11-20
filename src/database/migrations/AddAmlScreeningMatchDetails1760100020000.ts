import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAmlScreeningMatchDetails1760100020000 implements MigrationInterface {
  name = 'AddAmlScreeningMatchDetails1760100020000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "aml_screenings" ADD COLUMN IF NOT EXISTS "matchDetails" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "aml_screenings" DROP COLUMN IF EXISTS "matchDetails"`,
    );
  }
}
