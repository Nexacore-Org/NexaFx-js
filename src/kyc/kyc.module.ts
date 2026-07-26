import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KycDocument } from './kyc-document.entity';
import { KycService } from './kyc.service';
import { KycController } from './kyc.controller';
import { KycFileValidationService } from './kyc-file-validation.service';
import { SecurityModule } from '../common/security.module';

@Module({
  imports: [TypeOrmModule.forFeature([KycDocument]), SecurityModule],
  controllers: [KycController],
  providers: [KycService, KycFileValidationService],
  exports: [KycService, KycFileValidationService],
})
export class KycModule {}
