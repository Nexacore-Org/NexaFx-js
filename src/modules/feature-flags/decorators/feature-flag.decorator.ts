import { SetMetadata } from '@nestjs/common';

export const FEATURE_FLAG_KEY = 'feature_flag_name';

/**
 * Attach to a controller method to gate access behind a feature flag.
 * If the flag evaluates to false for the requesting user, a 404 is returned.
 *
 * @example
 * @FeatureFlag('new-checkout')
 * @Get('checkout')
 * checkout() { ... }
 */
export const FeatureFlag = (flagName: string) =>
  SetMetadata(FEATURE_FLAG_KEY, flagName);
