import { AppDataSource } from '../database/data-source';

async function dryRun() {
  const ds = await AppDataSource.initialize();

  const sqlInMemory = await ds.driver.createSchemaBuilder().log();

  console.log('--- MIGRATION DRY RUN ---');
  if (sqlInMemory.upQueries.length === 0) {
    console.log('No pending schema changes.');
  } else {
    console.log(sqlInMemory.upQueries.map((q) => q.query).join(';\n'));
  }

  await ds.destroy();
}

dryRun().catch((err) => {
  console.error('Dry run failed:', err);
  process.exit(1);
});
