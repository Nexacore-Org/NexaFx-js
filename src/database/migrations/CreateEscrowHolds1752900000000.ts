import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEscrowHolds1752900000000 implements MigrationInterface {
  name = 'CreateEscrowHolds1752900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "escrow_holds" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "payerId" uuid NOT NULL,
        "payeeId" uuid NOT NULL,
        "amount" numeric(20,8) NOT NULL,
        "currency" varchar(10) NOT NULL,
        "status" varchar NOT NULL DEFAULT 'HELD'
          CHECK ("status" IN ('HELD','RELEASED','REFUNDED','CANCELLED')),
        "releaseAfter" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "resolvedAt" timestamp
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_escrow_holds_payer" ON "escrow_holds" ("payerId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_escrow_holds_payee" ON "escrow_holds" ("payeeId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_escrow_holds_status" ON "escrow_holds" ("status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "escrow_holds"`);
  }
}
