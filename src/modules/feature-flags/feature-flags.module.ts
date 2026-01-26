import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeatureFlagEntity } from './entities/feature-flag.entity';
import { FeatureFlagsService } from './services/feature-flags.service';
import { FeatureFlagsAdminController } from './controllers/feature-flags-admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FeatureFlagEntity])],
  providers: [FeatureFlagsService],
  controllers: [FeatureFlagsAdminController],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
