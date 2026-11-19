import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Referral codes become a first-class entity so one code can be applied by
 * many referees. Legacy placeholder rows (`referrerId = referredId`) are
 * migrated into `referral_codes` and removed from `referrals`.
 */
export class SplitReferralCodes1754100000000 implements MigrationInterface {
  name = 'SplitReferralCodes1754100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "referral_codes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "ownerId" uuid NOT NULL UNIQUE,
        "code" varchar(64) NOT NULL UNIQUE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      INSERT INTO "referral_codes" ("ownerId", "code", "createdAt")
      SELECT "referrerId", "referralCode", "createdAt"
      FROM "referrals"
      WHERE "referrerId" = "referredId"
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(
      `DELETE FROM "referrals" WHERE "referrerId" = "referredId"`,
    );

    // A code is no longer unique per referral: every referee has its own row.
    await queryRunner.query(`
      DO $$
      DECLARE c record;
      BEGIN
        FOR c IN
          SELECT conname
          FROM pg_constraint
          WHERE conrelid = 'referrals'::regclass
            AND contype = 'u'
            AND pg_get_constraintdef(oid) LIKE '%referralCode%'
        LOOP
          EXECUTE format('ALTER TABLE "referrals" DROP CONSTRAINT %I', c.conname);
        END LOOP;

        FOR c IN
          SELECT indexname
          FROM pg_indexes
          WHERE tablename = 'referrals'
            AND indexdef LIKE '%UNIQUE%'
            AND indexdef LIKE '%referralCode%'
        LOOP
          EXECUTE format('DROP INDEX IF EXISTS %I', c.indexname);
        END LOOP;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_referrals_referral_code"
      ON "referrals" ("referralCode")
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'CHK_referrals_distinct_users'
            AND conrelid = 'referrals'::regclass
        ) THEN
          ALTER TABLE "referrals"
          ADD CONSTRAINT "CHK_referrals_distinct_users"
          CHECK ("referrerId" <> "referredId");
        END IF;
      END $$;
    `);

    await queryRunner.query(
      `ALTER TABLE "referral_rewards" ADD COLUMN IF NOT EXISTS "recipientId" uuid`,
    );
    await queryRunner.query(`
      UPDATE "referral_rewards"
      SET "recipientId" = "referrals"."referrerId"
      FROM "referrals"
      WHERE "referrals"."id" = "referral_rewards"."referralId"
        AND "referral_rewards"."recipientId" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "referral_rewards"
      SET "recipientId" = "referralId"
      WHERE "recipientId" IS NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "referral_rewards" ALTER COLUMN "recipientId" SET NOT NULL`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_referral_rewards_referral_recipient"
      ON "referral_rewards" ("referralId", "recipientId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_referral_rewards_referral_recipient"`,
    );
    await queryRunner.query(
      `ALTER TABLE "referral_rewards" DROP COLUMN IF EXISTS "recipientId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "referrals" DROP CONSTRAINT IF EXISTS "CHK_referrals_distinct_users"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_referrals_referral_code"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "referral_codes"`);
  }
}
