import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KycTierUpgradeEntity } from './entities/kyc-tier-upgrade.entity';
import { User } from '../../users/user.entity';
import { KycTiersService } from './services/kyc-tiers.service';
import { KycTiersController } from './controllers/kyc-tiers.controller';
import { KycTiersAdminController } from './controllers/kyc-tiers-admin.controller';
import { AuditModule } from '../../audit/audit.module';
import { KycModule } from '../../kyc/kyc.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([KycTierUpgradeEntity, User]),
    AuditModule,
    KycModule,
  ],
  controllers: [KycTiersController, KycTiersAdminController],
  providers: [KycTiersService],
  exports: [KycTiersService],
})
export class KycTiersModule {}
