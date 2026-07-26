import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KycTierUpgradeEntity } from './entities/kyc-tier-upgrade.entity';
import { UserEntity } from '../users/entities/user.entity';
import { KycTiersService } from './services/kyc-tiers.service';
import { KycTiersController } from './controllers/kyc-tiers.controller';
import { KycTiersAdminController } from './controllers/kyc-tiers-admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([KycTierUpgradeEntity, UserEntity]),
  ],
  controllers: [KycTiersController, KycTiersAdminController],
  providers: [KycTiersService],
  exports: [KycTiersService],
})
export class KycTiersModule {}
