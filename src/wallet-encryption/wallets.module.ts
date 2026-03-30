import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Wallet } from './entities/wallet.entity';
import { WalletEncryptionService } from './services/wallet-encryption.service';
import { WalletService } from './services/wallet.service';
import { KeyRotationJob } from './jobs/key-rotation.job';
import { WalletController } from './wallet.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Wallet])],
  providers: [WalletEncryptionService, WalletService, KeyRotationJob],
  controllers: [WalletController],
  exports: [WalletService, WalletEncryptionService],
})
export class WalletsModule {}
