import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFeeTiers1753000000000 implements MigrationInterface {
  name = 'CreateFeeTiers1753000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "fee_tiers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "kycLevel" varchar(20) NOT NULL,
        "currency" varchar(3) NOT NULL,
        "tierMin" decimal(18,8) NOT NULL,
        "tierMax" decimal(18,8) NOT NULL,
        "percentageFee" decimal(5,4) NOT NULL DEFAULT 0,
        "flatFee" decimal(18,8) NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_fee_tiers_kyc_level" ON "fee_tiers" ("kycLevel")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_fee_tiers_currency" ON "fee_tiers" ("currency")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_fee_tiers_active" ON "fee_tiers" ("isActive")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "fee_tiers"`);
  }
}
