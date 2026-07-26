import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCurrencyPairsAndFeeRecords1751300000000
  implements MigrationInterface
{
  name = 'AddCurrencyPairsAndFeeRecords1751300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ----------------------------------------------------------------
    // currency_pairs
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "currency_pairs" (
        "id"            uuid                   NOT NULL DEFAULT gen_random_uuid(),
        "fromCurrency"  character varying(10)  NOT NULL,
        "toCurrency"    character varying(10)  NOT NULL,
        "spreadPercent" numeric(5,4)           NOT NULL DEFAULT 0.0050,
        "isActive"      boolean                NOT NULL DEFAULT true,
        "createdAt"     TIMESTAMP              NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMP              NOT NULL DEFAULT now(),
        CONSTRAINT "PK_currency_pairs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_currency_pairs_from_to" UNIQUE ("fromCurrency", "toCurrency")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_currency_pairs_isActive" ON "currency_pairs" ("isActive")`,
    );

    // ----------------------------------------------------------------
    // fee_records
    // ----------------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "fee_records" (
        "id"              uuid                  NOT NULL DEFAULT gen_random_uuid(),
        "transactionId"   uuid                  NOT NULL,
        "userId"          uuid                  NOT NULL,
        "transactionType" character varying(20) NOT NULL,
        "amount"          numeric(18,8)         NOT NULL,
        "feeAmount"       numeric(18,8)         NOT NULL,
        "currency"        character varying(10) NOT NULL,
        "reason"          character varying(50),
        "createdAt"       TIMESTAMP             NOT NULL DEFAULT now(),
        CONSTRAINT "PK_fee_records" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_fee_records_transactionId" ON "fee_records" ("transactionId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fee_records_userId" ON "fee_records" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_fee_records_userId"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_fee_records_transactionId"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "fee_records"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_currency_pairs_isActive"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "currency_pairs"`);
  }
}
