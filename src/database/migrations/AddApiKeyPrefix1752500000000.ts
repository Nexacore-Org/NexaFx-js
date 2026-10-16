import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApiKeyPrefix1752500000000 implements MigrationInterface {
  name = 'AddApiKeyPrefix1752500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "keyPrefix" varchar(20)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "api_keys" DROP COLUMN IF EXISTS "keyPrefix"`);
  }
}
