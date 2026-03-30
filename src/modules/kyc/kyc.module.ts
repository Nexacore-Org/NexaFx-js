import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KycDocumentEntity } from './entities/kyc-document.entity';
import { CountryRuleEntity } from './entities/country-rule.entity';
import { KycService } from './services/kyc.service';
import { KycController } from './controllers/kyc.controller';
import { KycAdminController } from './controllers/kyc-admin.controller';
import { KycComplianceGuard } from './guards/kyc-compliance.guard';

@Module({
  imports: [TypeOrmModule.forFeature([KycDocumentEntity, CountryRuleEntity])],
  controllers: [KycController, KycAdminController],
  providers: [KycService, KycComplianceGuard],
  exports: [KycService, KycComplianceGuard],
})
export class KycModule {}
