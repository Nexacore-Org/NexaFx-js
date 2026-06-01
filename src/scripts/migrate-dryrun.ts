import { AppDataSource } from '../database/data-source';

async function main(): Promise<void> {
  await AppDataSource.initialize();

  const pending = await AppDataSource.showMigrations();

  if (pending) {
    console.error('Pending migrations detected. Run migrations before deploying.');
    await AppDataSource.destroy();
    process.exit(1);
  }

  console.log('All migrations are applied.');
  await AppDataSource.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration dry-run failed:', err);
  process.exit(1);
});