import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKeyVersionToWalletBalances1751210000000
  implements MigrationInterface
{
  name = 'AddKeyVersionToWalletBalances1751210000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wallet_balances" ADD COLUMN IF NOT EXISTS "keyVersion" integer NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wallet_balances" DROP COLUMN IF EXISTS "keyVersion"`,
    );
  }
}
