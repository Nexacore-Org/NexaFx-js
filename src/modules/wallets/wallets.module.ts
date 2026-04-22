import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { WalletBalanceService } from './services/wallet-balance.service';
import { StatementService } from './services/statement.service';
import { BeneficiaryService } from './services/beneficiary.service';
import { PortfolioService } from './services/portfolio.service';
import { WalletController } from './controllers/wallet.controller';
import { BeneficiaryController } from './controllers/beneficiary.controller';
import { SpendCapGuard } from './guards/spend-cap.guard';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { WalletEntity } from '../users/entities/wallet.entity';
import { BeneficiaryEntity } from './entities/beneficiary.entity';
import { WalletAliasEntity } from '../transactions/entities/wallet-alias.entity';
import { WalletAliasService } from '../transactions/services/wallet-alias.service';
import { WalletSyncJob } from './jobs/wallet-sync.job';
import { PortfolioSnapshotJob } from './jobs/portfolio-snapshot.job';
import { PortfolioSnapshot } from './entities/portfolio-snapshot.entity';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionEntity, WalletEntity, BeneficiaryEntity, WalletAliasEntity, PortfolioSnapshot]),
    CacheModule.register(),
    BlockchainModule,
  ],
  controllers: [WalletController, BeneficiaryController],
  providers: [WalletBalanceService, StatementService, BeneficiaryService, WalletAliasService, SpendCapGuard, WalletSyncJob, PortfolioService, PortfolioSnapshotJob],
  exports: [WalletBalanceService, StatementService, BeneficiaryService, SpendCapGuard, PortfolioService],
})
export class WalletsModule {}
