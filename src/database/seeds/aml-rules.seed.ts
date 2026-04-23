import { DataSource } from 'typeorm';
import { AmlRuleEntity } from '../../compliance-evidence/entities/aml-rule.entity';

export async function seedAmlRules(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(AmlRuleEntity);

  const rules: Partial<AmlRuleEntity>[] = [
    {
      ruleType: 'STRUCTURING',
      name: 'Structuring Detection',
      description: 'Detects transactions structured to avoid reporting thresholds',
      enabled: true,
      thresholds: { maxAmount: 9000, windowHours: 24 },
      riskScoreWeight: 40,
    },
    {
      ruleType: 'SMURFING',
      name: 'Smurfing Detection',
      description: 'Detects multiple small transactions from different sources',
      enabled: true,
      thresholds: { minCount: 5, windowHours: 24, maxSingleAmount: 2000 },
      riskScoreWeight: 35,
    },
    {
      ruleType: 'VELOCITY_BURST',
      name: 'Velocity Burst',
      description: 'Detects sudden spike in transaction velocity',
      enabled: true,
      thresholds: { maxTransactionsPerHour: 10, maxAmountPerHour: 50000 },
      riskScoreWeight: 30,
    },
  ];

  for (const rule of rules) {
    await repo.upsert(rule as AmlRuleEntity, ['ruleType']);
  }

  console.log(`Seeded ${rules.length} AML rules`);
}
