import { AppDataSource } from '../data-source';
import { seedCountries } from './country.seed';
import { seedFeatureFlags } from './feature-flag.seed';
import { seedRoles } from './roles.seed';

async function runSeeds() {
  const ds = await AppDataSource.initialize();

  await seedCountries(ds);
  await seedFeatureFlags(ds);
  await seedRoles(ds);

  await ds.destroy();
}

runSeeds();