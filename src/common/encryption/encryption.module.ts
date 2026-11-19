import { Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service';
import { EncryptionKeyBootCheck } from './encryption-key-boot-check.service';

@Module({
  providers: [EncryptionService, EncryptionKeyBootCheck],
  exports: [EncryptionService],
})
export class EncryptionModule {}
