import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeatureFlagEntity } from './entities/feature-flag.entity';
import { FeatureFlagsService } from './services/feature-flags.service';
import { FeatureFlagEvaluationService } from './services/feature-flag-evaluation.service';
import { FeatureFlagGuard } from './guards/feature-flag.guard';
import { FeatureFlagsAdminController } from './controllers/feature-flags-admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FeatureFlagEntity])],
  providers: [FeatureFlagsService, FeatureFlagEvaluationService, FeatureFlagGuard],
  controllers: [FeatureFlagsAdminController],
  exports: [FeatureFlagsService, FeatureFlagEvaluationService, FeatureFlagGuard],
})
export class FeatureFlagsModule {}
