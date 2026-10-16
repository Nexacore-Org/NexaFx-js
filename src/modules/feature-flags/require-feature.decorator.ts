import { SetMetadata } from '@nestjs/common';
import { FeatureFlag } from './feature-flags.catalog';

export const REQUIRED_FEATURE_KEY = 'requiredFeature';

/** Route (or controller) is only available while the flag is on; see FeatureFlagGuard. */
export const RequireFeature = (flag: FeatureFlag) => SetMetadata(REQUIRED_FEATURE_KEY, flag);
