import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPreferredLanguageToUsers1751220000000
  implements MigrationInterface
{
  name = 'AddPreferredLanguageToUsers1751220000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD COLUMN "preferredLanguage" varchar(2) NOT NULL DEFAULT 'en'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "preferredLanguage"
    `);
  }
}
