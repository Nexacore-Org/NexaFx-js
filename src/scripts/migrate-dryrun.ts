import { AppDataSource } from '../database/data-source';
import { acquireMigrationLock } from '../database/migration-lock';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  const releaseLock = await acquireMigrationLock(AppDataSource);

  try {
    const pending = await AppDataSource.showMigrations();

    if (pending) {
      console.error('Pending migrations detected. Run migrations before deploying.');
      await AppDataSource.destroy();
      process.exit(1);
    }

    console.log('All migrations are applied.');
  } finally {
    await releaseLock();
    await AppDataSource.destroy();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration dry-run failed:', err);
  process.exit(1);
});