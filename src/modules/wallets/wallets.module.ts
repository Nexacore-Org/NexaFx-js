import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { WalletBalanceService } from './services/wallet-balance.service';
import { StatementService } from './services/statement.service';
import { BeneficiaryService } from './services/beneficiary.service';
import { WalletController } from './controllers/wallet.controller';
import { BeneficiaryController } from './controllers/beneficiary.controller';
import { SpendCapGuard } from './guards/spend-cap.guard';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { WalletEntity } from '../users/entities/wallet.entity';
import { BeneficiaryEntity } from './entities/beneficiary.entity';
import { WalletAliasEntity } from '../transactions/entities/wallet-alias.entity';
import { WalletAliasService } from '../transactions/services/wallet-alias.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionEntity, WalletEntity, BeneficiaryEntity, WalletAliasEntity]),
    CacheModule.register(),
  ],
  controllers: [WalletController, BeneficiaryController],
  providers: [WalletBalanceService, StatementService, BeneficiaryService, WalletAliasService, SpendCapGuard],
  exports: [WalletBalanceService, StatementService, BeneficiaryService, SpendCapGuard],
})
export class WalletsModule {}
