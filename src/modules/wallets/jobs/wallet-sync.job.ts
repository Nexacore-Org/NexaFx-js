import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletEntity } from '../../users/entities/wallet.entity';
import { BlockchainService } from '../../blockchain/blockchain.service';

/**
 * WalletSyncJob
 *
 * Daily cron that syncs on-chain balances to internal wallet availableBalance.
 * Only syncs wallets that have a publicKey (on-chain address).
 */
@Injectable()
export class WalletSyncJob {
  private readonly logger = new Logger(WalletSyncJob.name);

  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    private readonly blockchainService: BlockchainService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async syncWalletBalances(): Promise<void> {
    this.logger.log('Starting daily wallet balance sync from blockchain');

    const wallets = await this.walletRepo.find({
      where: { status: 'active' },
    });

    const onChainWallets = wallets.filter((w) => !!w.publicKey);
    let synced = 0;
    let failed = 0;

    for (const wallet of onChainWallets) {
      try {
        const onChainBalance = await this.blockchainService.getBalance(wallet.publicKey);
        const balanceNum = parseFloat(onChainBalance);

        await this.walletRepo.update(wallet.id, {
          availableBalance: balanceNum,
        });
        synced++;
      } catch (error) {
        this.logger.error(
          `Failed to sync balance for wallet ${wallet.id} (${wallet.publicKey}):`,
          error,
        );
        failed++;
      }
    }

    this.logger.log(
      `Wallet sync complete: ${synced} synced, ${failed} failed out of ${onChainWallets.length} on-chain wallets`,
    );
  }
}
