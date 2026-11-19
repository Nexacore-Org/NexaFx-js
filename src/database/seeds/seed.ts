import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildPostgresConnectionOptions } from '../../config/database-options';

// Same connection settings (including DB_SSL / DB_SSL_CA) as the app and the
// migration CLI (issues #1290, #1541, #1542).
const dataSource = new DataSource({
  type: 'postgres',
  ...buildPostgresConnectionOptions(),
  synchronize: false,
  logging: false,
});

// [fromCurrency, toCurrency, spreadPercent]
export const CURRENCY_PAIRS: Array<[string, string, number]> = [
  ['XLM', 'USDC', 0.005],
  ['XLM', 'USD', 0.005],
  ['USD', 'NGN', 0.005],
  ['USDC', 'NGN', 0.005],
  ['EUR', 'USD', 0.003],
  ['GBP', 'USD', 0.003],
  ['USD', 'EUR', 0.003],
  ['USD', 'GBP', 0.003],
  ['USDC', 'USD', 0.002],
  ['USD', 'USDC', 0.002],
];

/**
 * Seeds reference data the application actually reads: the `currency_pairs`
 * table, which is created by migration AddCurrencyPairsAndFeeRecords (its
 * UQ_currency_pairs_from_to constraint backs the ON CONFLICT clause below).
 *
 * Run `npm run migration:run` first. This function throws on failure so it can
 * be called from tests; only the CLI entry point below exits the process.
 */
export async function seed(ds: DataSource = dataSource): Promise<void> {
  const owned = !ds.isInitialized;
  if (owned) {
    await ds.initialize();
  }
  const queryRunner = ds.createQueryRunner();

  try {
    await queryRunner.connect();
    await queryRunner.startTransaction();

    // Currency pairs (idempotent upsert)
    for (const [fromCurrency, toCurrency, spreadPercent] of CURRENCY_PAIRS) {
      await queryRunner.query(
        `INSERT INTO currency_pairs ("fromCurrency", "toCurrency", "spreadPercent", "isActive")
         VALUES ($1, $2, $3, true)
         ON CONFLICT ("fromCurrency", "toCurrency")
         DO UPDATE SET "spreadPercent" = EXCLUDED."spreadPercent", "isActive" = true, "updatedAt" = NOW()`,
        [fromCurrency, toCurrency, spreadPercent],
      );
    }

    await queryRunner.commitTransaction();
  } catch (err) {
    if (queryRunner.isTransactionActive) {
      await queryRunner.rollbackTransaction();
    }
    throw err;
  } finally {
    await queryRunner.release();
    if (owned) {
      await ds.destroy();
    }
  }
}

if (require.main === module && process.env.NODE_ENV !== 'test') {
  seed()
    .then(() => console.log('Seed completed successfully'))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
