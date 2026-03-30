import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletBalanceService } from './services/wallet-balance.service';
import { WalletController } from './controllers/wallet.controller';
import { SpendCapGuard } from './guards/spend-cap.guard';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { WalletEntity } from '../users/entities/wallet.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionEntity, WalletEntity]),
  ],
  controllers: [WalletController],
  providers: [WalletBalanceService, SpendCapGuard],
  exports: [WalletBalanceService, SpendCapGuard],
})
export class WalletsModule {}
