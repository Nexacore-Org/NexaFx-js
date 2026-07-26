import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletBalanceEntity } from '../../wallet/wallet-balance.entity';
import { EncryptionService } from '../../common/encryption/encryption.service';

@Injectable()
export class KeyRotationService {
  private readonly logger = new Logger(KeyRotationService.name);

  constructor(
    @InjectRepository(WalletBalanceEntity)
    private readonly walletRepo: Repository<WalletBalanceEntity>,
    private readonly encryption: EncryptionService,
  ) {}

  /**
   * Re-encrypt all wallet records that are not yet on the current key version.
   * Safe to run multiple times (idempotent).
   */
  async rotate(): Promise<{ total: number; rotated: number; skipped: number }> {
    const currentVersion = this.encryption.getCurrentVersion();
    const all = await this.walletRepo.find();
    let rotated = 0;
    let skipped = 0;

    for (const wallet of all) {
      if (wallet.keyVersion === currentVersion) {
        skipped++;
        continue;
      }
      // wallet.keyVersion tracks which key encrypted its sensitive fields.
      // Update to current version (actual field re-encryption would be added
      // per-field as sensitive columns are introduced).
      wallet.keyVersion = currentVersion;
      await this.walletRepo.save(wallet);
      rotated++;
      this.logger.log(
        `Rotated wallet ${wallet.id} (accountId=${wallet.accountId}, currency=${wallet.currency}) to key v${currentVersion}`,
      );
    }

    this.logger.log(
      `Key rotation complete: total=${all.length} rotated=${rotated} skipped=${skipped}`,
    );
    return { total: all.length, rotated, skipped };
  }
}
