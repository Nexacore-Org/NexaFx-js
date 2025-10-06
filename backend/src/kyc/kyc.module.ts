import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { KycSubmission } from './entities/kyc-submission.entity';
import { KycDocument } from './entities/kyc-document.entity';
import { KycService } from './services/kyc.service';
import { FileStorageService } from './services/file-storage.service';
import { VerificationProviderService } from './services/verification-provider.service';
import { KycController } from './kyc.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([KycSubmission, KycDocument]),
    ConfigModule,
  ],
  controllers: [KycController],
  providers: [
    KycService,
    FileStorageService,
    VerificationProviderService,
  ],
})
export class KycModule {}