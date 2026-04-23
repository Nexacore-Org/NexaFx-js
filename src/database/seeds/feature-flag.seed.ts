import { DataSource } from 'typeorm';
import { FeatureFlagEntity } from '../../modules/feature-flags/entities/feature-flag.entity';

export async function seedFeatureFlags(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(FeatureFlagEntity);

  const flags: Partial<FeatureFlagEntity>[] = [
    {
      name: 'new-dashboard',
      description: 'Redesigned user dashboard',
      enabled: false,
      targetingRules: [{ type: 'percentage', value: 10 }],
    },
    {
      name: 'advanced-analytics',
      description: 'Advanced spending analytics',
      enabled: true,
      targetingRules: [{ type: 'role', value: 'premium' }],
    },
    {
      name: 'instant-fx',
      description: 'Instant FX conversion feature',
      enabled: false,
      targetingRules: [{ type: 'country', value: 'NG' }],
    },
  ];

  for (const flag of flags) {
    await repo.upsert(flag as FeatureFlagEntity, ['name']);
  }

  console.log(`Seeded ${flags.length} feature flags`);
}
