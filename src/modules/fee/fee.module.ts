import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeeRuleEntity } from './entities/fee-rule.entity';
import { FeeEngineService } from './services/fee-engine.service';
import { FeeRulesAdminService } from './services/fee-rules-admin.service';
import { FeeAdminController } from './controllers/fee-admin.controller';
import { FeeSimulationController } from './controllers/fee-simulation.controller';
import { FeeTiersModule } from '../../fee-tiers/fee-tiers.module';

@Module({
  imports: [TypeOrmModule.forFeature([FeeRuleEntity]), FeeTiersModule],
  providers: [FeeEngineService, FeeRulesAdminService],
  controllers: [FeeAdminController, FeeSimulationController],
  exports: [FeeEngineService],
})
export class FeesModule {}
