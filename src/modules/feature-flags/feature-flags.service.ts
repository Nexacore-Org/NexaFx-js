import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ALL_FEATURE_FLAGS, FeatureFlag, featureFlagEnvKey } from './feature-flags.catalog';

@Injectable()
export class FeatureFlagsService {
  constructor(private readonly config: ConfigService) {}

  isEnabled(flag: FeatureFlag | string): boolean {
    const value = this.config.get<string | boolean>(featureFlagEnvKey(flag));
    return value === true || value === 'true';
  }

  getAll(): Record<string, boolean> {
    return Object.fromEntries(ALL_FEATURE_FLAGS.map((flag) => [flag, this.isEnabled(flag)]));
  }
}
