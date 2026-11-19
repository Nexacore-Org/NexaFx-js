import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReferralRewards1753500000000 implements MigrationInterface {
  name = 'CreateReferralRewards1753500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "referral_rewards" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "referralId" uuid NOT NULL,
        "recipientId" uuid NOT NULL,
        "rewardType" varchar(20) NOT NULL CHECK ("rewardType" IN ('credit','discount')),
        "amount" decimal(20,8) NOT NULL,
        "currency" varchar(10) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','paid')),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "paidAt" TIMESTAMP
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_referral_rewards_referral" ON "referral_rewards" ("referralId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_referral_rewards_referral_recipient" ON "referral_rewards" ("referralId","recipientId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_referral_rewards_referral"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_referral_rewards_referral_recipient"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "referral_rewards"`);
  }
}
