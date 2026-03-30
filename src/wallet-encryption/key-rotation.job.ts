import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { Wallet } from '../entities/wallet.entity';
import { WalletEncryptionService } from '../services/wallet-encryption.service';

export interface KeyRotationResult {
  total: number;
  rotated: number;
  skipped: number;
  failed: number;
  durationMs: number;
}

/**
 * Key Rotation Job
 * ─────────────────
 * Re-encrypts every wallet's private key from the OLD encryption key to the
 * CURRENT `WALLET_ENCRYPTION_KEY`.
 *
 * Atomicity / restartability guarantees
 * ───────────────────────────────────────
 * • Each wallet is processed in its own DB transaction so a crash mid-run
 *   leaves no wallet in a half-rotated state.
 * • Already-rotated wallets (keyVersion incremented) are detected by comparing
 *   the stored keyVersion with a rotation target version, so the job can be
 *   safely re-run after a crash.
 * • Failures on individual wallets are logged and counted — they do NOT abort
 *   the whole rotation so the run finishes and the ops team can retry selectively.
 */
@Injectable()
export class KeyRotationJob {
  private readonly logger = new Logger(KeyRotationJob.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    private readonly encryptionService: WalletEncryptionService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * @param oldKeyHex   64-char hex of the key that was used to encrypt existing records.
   * @param targetVersion  Monotonic version number after rotation (used for idempotency).
   */
  async rotate(oldKeyHex: string, targetVersion: number): Promise<KeyRotationResult> {
    const startedAt = Date.now();

    if (!oldKeyHex || oldKeyHex.length !== 64) {
      throw new Error('oldKeyHex must be a 64-character hex string.');
    }

    this.logger.log(
      `Key rotation starting — targetVersion=${targetVersion}`,
    );

    // Only rotate wallets that haven't reached the target version yet
    const wallets = await this.walletRepository.find({
      where: { keyVersion: targetVersion - 1 },
    });

    const result: KeyRotationResult = {
      total: wallets.length,
      rotated: 0,
      skipped: 0,
      failed: 0,
      durationMs: 0,
    };

    for (const wallet of wallets) {
      try {
        const newEncrypted = this.encryptionService.reEncrypt(
          wallet.privateKeyEncrypted,
          oldKeyHex,
        );

        await this.dataSource.transaction(async (manager) => {
          await manager.update(
            Wallet,
            { id: wallet.id },
            {
              privateKeyEncrypted: newEncrypted,
              keyVersion: targetVersion,
            },
          );
        });

        result.rotated++;
        // Log rotation progress without exposing any key material
        this.logger.log(
          `Rotated wallet id=${wallet.id} → keyVersion=${targetVersion}`,
        );
      } catch (err) {
        result.failed++;
        // Never log wallet.privateKeyEncrypted or the old/new key
        this.logger.error(
          `Failed to rotate wallet id=${wallet.id}: ${(err as Error).message}`,
        );
      }
    }

    result.durationMs = Date.now() - startedAt;

    this.logger.log(
      `Key rotation complete — ` +
        `total=${result.total} rotated=${result.rotated} ` +
        `skipped=${result.skipped} failed=${result.failed} ` +
        `durationMs=${result.durationMs}`,
    );

    // Audit trail entry — written after the main loop so a crash during rotation
    // doesn't prevent the audit record from being saved
    await this.writeAuditEntry(targetVersion, result);

    return result;
  }

  private async writeAuditEntry(
    targetVersion: number,
    result: KeyRotationResult,
  ): Promise<void> {
    try {
      await this.dataSource.query(
        `INSERT INTO audit_logs (event_type, payload, created_at)
         VALUES ($1, $2, NOW())`,
        [
          'WALLET_KEY_ROTATION',
          JSON.stringify({
            targetVersion,
            total: result.total,
            rotated: result.rotated,
            failed: result.failed,
            durationMs: result.durationMs,
          }),
        ],
      );
    } catch (err) {
      // Audit failure should not mask the rotation result
      this.logger.warn(`Audit log write failed: ${(err as Error).message}`);
    }
  }
}
