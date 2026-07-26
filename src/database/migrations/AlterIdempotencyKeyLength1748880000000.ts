import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterIdempotencyKeyLength1748880000000
  implements MigrationInterface
{
  name = 'AlterIdempotencyKeyLength1748880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "idempotency_keys" ALTER COLUMN "key" TYPE VARCHAR(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "idempotency_keys" ALTER COLUMN "key" TYPE TEXT`,
    );
  }
}
