import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ALL_FEATURE_FLAGS, FeatureFlag, featureFlagEnvKey } from './feature-flags.catalog';

@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);

  constructor(private readonly config: ConfigService) {
    // Operators need to see the effective kill-switch state at boot: the public
    // endpoint reports the same values to clients.
    this.logger.log(`Feature flags: ${JSON.stringify(this.getAll())}`);
  }

  isEnabled(flag: FeatureFlag | string): boolean {
    const value = this.config.get<string | boolean>(featureFlagEnvKey(flag));
    return value === true || value === 'true';
  }

  getAll(): Record<string, boolean> {
    return Object.fromEntries(ALL_FEATURE_FLAGS.map((flag) => [flag, this.isEnabled(flag)]));
  }
}
