import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Wallet } from './wallet.entity';
import { WalletEncryptionService } from './wallet-encryption.service';
import { WalletService } from './wallet.service';
import { KeyRotationJob } from './key-rotation.job';
import { WalletController } from './wallet.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Wallet])],
  providers: [WalletEncryptionService, WalletService, KeyRotationJob],
  controllers: [WalletController],
  exports: [WalletService, WalletEncryptionService],
})
export class WalletEncryptionModule {}
