import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureFlag } from './feature-flags.catalog';
import { FeatureFlagsService } from './feature-flags.service';
import { REQUIRED_FEATURE_KEY } from './require-feature.decorator';

/**
 * Returns 404 for routes marked `@RequireFeature(flag)` while the flag is off,
 * so a disabled feature looks like it does not exist.
 */
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly flags: FeatureFlagsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const flag = this.reflector.getAllAndOverride<FeatureFlag | undefined>(REQUIRED_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!flag) return true;
    if (!this.flags.isEnabled(flag)) {
      throw new NotFoundException('Not found');
    }
    return true;
  }
}
