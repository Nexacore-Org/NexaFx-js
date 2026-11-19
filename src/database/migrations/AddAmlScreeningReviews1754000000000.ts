import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAmlScreeningReviews1754000000000 implements MigrationInterface {
  name = 'AddAmlScreeningReviews1754000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "aml_screenings"
      ADD COLUMN IF NOT EXISTS "disposition" varchar(30)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "aml_screening_reviews" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "screeningId" uuid NOT NULL,
        "reviewedBy" uuid NOT NULL,
        "disposition" varchar(30) NOT NULL,
        "notes" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_aml_screening_reviews_screening_created"
      ON "aml_screening_reviews" ("screeningId", "createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_aml_screening_reviews_screening_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "aml_screening_reviews"`);
    await queryRunner.query(
      `ALTER TABLE "aml_screenings" DROP COLUMN IF EXISTS "disposition"`,
    );
  }
}
