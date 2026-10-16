import { Global, Module } from '@nestjs/common';
import { FeatureFlagGuard } from './feature-flag.guard';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagsService } from './feature-flags.service';

// Global so any controller can use @RequireFeature without importing this module.
@Global()
@Module({
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService, FeatureFlagGuard],
  exports: [FeatureFlagsService, FeatureFlagGuard],
})
export class FeatureFlagsModule {}
