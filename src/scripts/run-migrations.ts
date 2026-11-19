import 'reflect-metadata';
import { AppDataSource } from '../database/data-source';
import { acquireMigrationLock } from '../database/migration-lock';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  const release = await acquireMigrationLock(AppDataSource);
  try {
    await AppDataSource.runMigrations({ transaction: 'each' });
  } finally {
    await release();
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Migration run failed', error);
  process.exit(1);
});
