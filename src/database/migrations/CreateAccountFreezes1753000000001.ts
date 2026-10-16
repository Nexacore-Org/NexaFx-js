import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAccountFreezes1753000000001 implements MigrationInterface {
  name = 'CreateAccountFreezes1753000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "account_freezes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "reason" text NOT NULL,
        "frozenBy" varchar(255) NOT NULL,
        "unfrozenBy" varchar(255),
        "frozenAt" timestamp NOT NULL,
        "unfrozenAt" timestamp,
        "isActive" boolean NOT NULL DEFAULT true,
        "notes" text,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_account_freezes_user_id" ON "account_freezes" ("userId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_account_freezes_is_active" ON "account_freezes" ("isActive")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_account_freezes_active_user" ON "account_freezes" ("userId") WHERE "isActive" = true`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "account_freezes"`);
  }
}
