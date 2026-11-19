/**
 * Encrypts and hashes `kyc_documents.documentNumber` values written before issue #1535.
 * Safe to re-run: rows already sealed (`enc:` prefix) are skipped.
 *
 *   WALLET_ENCRYPTION_KEY=... [KYC_DOCUMENT_HASH_KEY=...] npm run kyc:backfill-document-numbers
 */
import 'reflect-metadata';
import { AppDataSource } from '../database/data-source';
import { EncryptionService } from '../common/encryption/encryption.service';
import { normaliseDocumentNumber, sealDocumentNumber } from '../kyc/kyc-document-number';

const BATCH = 500;

async function main(): Promise<void> {
  await AppDataSource.initialize();
  // EncryptionService reads WALLET_ENCRYPTION_KEY* from process.env when ConfigService has none.
  const encryption = new EncryptionService({ get: () => undefined } as never);

  let total = 0;
  for (;;) {
    const rows: Array<{ id: string; documentNumber: string }> = await AppDataSource.query(
      `SELECT "id", "documentNumber" FROM "kyc_documents" WHERE "documentNumber" NOT LIKE 'enc:%' LIMIT ${BATCH}`,
    );
    if (rows.length === 0) break;
    for (const row of rows) {
      const { stored, hash } = sealDocumentNumber(encryption, row.documentNumber);
      await AppDataSource.query(
        `UPDATE "kyc_documents" SET "documentNumber" = $1, "documentNumberHash" = $2 WHERE "id" = $3`,
        [stored, hash, row.id],
      );
      total += 1;
    }
    console.log(`Backfilled ${total} document number(s)...`);
  }
  console.log(`Done. ${total} row(s) encrypted. (normalisation example: ${normaliseDocumentNumber(' ab-12 ')})`);
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
