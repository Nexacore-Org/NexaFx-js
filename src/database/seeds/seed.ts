import { AppDataSource } from '../data-source';
import { seedCountries } from './country.seed';
import { seedFeatureFlags } from './feature-flag.seed';
import { seedRoles } from './roles.seed';
import { seedAmlRules } from './aml-rules.seed';
import { seedNotificationPreferences } from './notification-preferences.seed';

async function runSeeds() {
  const ds = await AppDataSource.initialize();

  await seedCountries(ds);
  await seedFeatureFlags(ds);
  await seedRoles(ds);
  await seedAmlRules(ds);
  await seedNotificationPreferences(ds);

  await ds.destroy();
  console.log('All seeds completed');
}

runSeeds().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
