import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KycDocument } from './kyc-document.entity';
import { KycService } from './kyc.service';
import { KycController } from './kyc.controller';
import { KycFileValidationService } from './kyc-file-validation.service';
import { SecurityModule } from '../common/security.module';
import { AuditModule } from '../audit/audit.module';
import { User } from '../users/user.entity';
import { EncryptionModule } from '../common/encryption/encryption.module';

@Module({
  imports: [TypeOrmModule.forFeature([KycDocument, User]), SecurityModule, AuditModule, EncryptionModule],
  controllers: [KycController],
  providers: [KycService, KycFileValidationService],
  exports: [KycService, KycFileValidationService],
})
export class KycModule {}
