import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsPrimaryToWallets1751000000001 implements MigrationInterface {
  name = 'AddIsPrimaryToWallets1751000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wallet_balances" ADD COLUMN "is_primary" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wallet_balances" DROP COLUMN "is_primary"`,
    );
  }
}
