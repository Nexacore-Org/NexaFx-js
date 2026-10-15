import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletBalanceEntity } from './wallet-balance.entity';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { LedgerModule } from '../ledger/ledger.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([WalletBalanceEntity]), LedgerModule, AuditModule],
  controllers: [WalletsController],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
