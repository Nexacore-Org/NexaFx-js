import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Issue #1535: keyed hash column used to detect the same ID document being registered by several
 * accounts, now that `documentNumber` is stored encrypted. Existing rows are encrypted and hashed
 * by `npm run kyc:backfill-document-numbers` (it needs the application's encryption key, which
 * a SQL migration does not have).
 */
export class AddKycDocumentNumberHash1753200000002 implements MigrationInterface {
  name = 'AddKycDocumentNumberHash1753200000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kyc_documents" ADD COLUMN IF NOT EXISTS "documentNumberHash" character varying(64)`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_kyc_documents_documentNumberHash" ON "kyc_documents" ("documentNumberHash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_kyc_documents_documentNumberHash"`);
    await queryRunner.query(`ALTER TABLE "kyc_documents" DROP COLUMN IF EXISTS "documentNumberHash"`);
  }
}
