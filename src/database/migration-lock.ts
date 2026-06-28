import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

const MIGRATION_LOCK_KEY = 193847582;

export async function acquireMigrationLock(dataSource: DataSource): Promise<() => Promise<void>> {
  const logger = new Logger('MigrationLock');
  logger.log('Acquiring migration advisory lock...');

  await dataSource.query(`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY})`);
  logger.log('Migration lock acquired');

  return async () => {
    await dataSource.query(`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`);
    logger.log('Migration lock released');
  };
}
