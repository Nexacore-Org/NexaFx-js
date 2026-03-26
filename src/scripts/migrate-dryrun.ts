import { AppDataSource } from '../src/database/data-source';

async function dryRun() {
  const ds = await AppDataSource.initialize();

  const sqlInMemory = await ds.driver.createSchemaBuilder().log();

  console.log('--- DRY RUN SQL ---');
  console.log(sqlInMemory.upQueries.map(q => q.query).join(';\n'));

  await ds.destroy();
}

dryRun();