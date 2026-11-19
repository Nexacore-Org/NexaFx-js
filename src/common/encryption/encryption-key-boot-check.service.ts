import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EncryptionService } from './encryption.service';

/**
 * Fails the boot when `wallet_balances` contains rows encrypted under a key
 * version that is not configured (issue #1549). Without this, a rotation that
 * drops `WALLET_ENCRYPTION_KEY_V<n>` too early only shows up as a decrypt error
 * on the first wallet operation. Logs versions only, never key material.
 */
@Injectable()
export class EncryptionKeyBootCheck implements OnApplicationBootstrap {
  private readonly logger = new Logger(EncryptionKeyBootCheck.name);

  constructor(
    private readonly encryption: EncryptionService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const rows: Array<{ keyVersion: number | string }> = await this.dataSource.query(
      'SELECT DISTINCT "keyVersion" FROM "wallet_balances"',
    );
    const stored = rows.map((r) => Number(r.keyVersion)).filter((v) => Number.isInteger(v));
    const missing = this.encryption.getMissingKeyVersions(stored);

    if (missing.length > 0) {
      throw new Error(
        `wallet_balances contains rows encrypted with key version(s) [${missing.join(', ')}] ` +
          `but no key is configured for them. Set WALLET_ENCRYPTION_KEY_V<n> for each missing version ` +
          `(see docs/security.md, "WALLET_ENCRYPTION_KEY Rotation").`,
      );
    }
    this.logger.log(`Wallet key versions in use: [${stored.sort((a, b) => a - b).join(', ') || 'none'}]; all keys loaded`);
  }
}
