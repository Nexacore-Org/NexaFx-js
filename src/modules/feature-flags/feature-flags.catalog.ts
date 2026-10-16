/**
 * Single catalog of feature flags. Each flag is controlled by an environment
 * variable named `FEATURE_<NAME>` ("true" enables it; unset/anything else is
 * off), so a risky feature can be switched off per environment without a deploy.
 */
export enum FeatureFlag {
  FX_TRADING = 'fx-trading',
  REFERRALS = 'referrals',
  BLOCKCHAIN = 'blockchain',
  TWO_FA = 'two-fa',
  PUSH_NOTIFICATIONS = 'push-notifications',
}

export const ALL_FEATURE_FLAGS: FeatureFlag[] = Object.values(FeatureFlag);

/** `fx-trading` -> `FEATURE_FX_TRADING` */
export function featureFlagEnvKey(flag: FeatureFlag | string): string {
  return `FEATURE_${flag.toUpperCase().replace(/-/g, '_')}`;
}
