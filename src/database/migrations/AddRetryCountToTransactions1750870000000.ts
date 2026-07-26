import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRetryCountToTransactions1750870000000
  implements MigrationInterface
{
  name = 'AddRetryCountToTransactions1750870000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "retryCount" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN IF EXISTS "retryCount"`,
    );
  }
}
