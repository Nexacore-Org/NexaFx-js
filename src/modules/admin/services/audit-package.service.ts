import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { AuditPackage, AuditPackageStatus } from '../entities/audit-package.entity';
import { LedgerVerificationService } from './ledger-verification.service';

@Injectable()
export class AuditPackageService {
  private readonly logger = new Logger(AuditPackageService.name);

  constructor(
    @InjectRepository(AuditPackage)
    private readonly packageRepo: Repository<AuditPackage>,
    private readonly ledgerVerification: LedgerVerificationService,
  ) {}

  async listPackages(): Promise<AuditPackage[]> {
    return this.packageRepo.find({ order: { createdAt: 'DESC' } });
  }

  /**
   * Initiates async audit package generation.
   * In production this would enqueue a job; here we run inline.
   */
  async generatePackage(triggeredBy: string): Promise<AuditPackage> {
    const pkg = await this.packageRepo.save(
      this.packageRepo.create({ triggeredBy, status: AuditPackageStatus.GENERATING }),
    );

    // Run async (fire-and-forget with error handling)
    this.buildPackage(pkg.id).catch((err) =>
      this.logger.error(`Audit package ${pkg.id} failed: ${err.message}`),
    );

    return pkg;
  }

  private async buildPackage(packageId: string): Promise<void> {
    const pkg = await this.packageRepo.findOneOrFail({ where: { id: packageId } });

    try {
      const ledgerResult = await this.ledgerVerification.verifyLedger();

      // Build manifest content (in production: ZIP with all data)
      const manifestContent = JSON.stringify({
        packageId,
        generatedAt: new Date().toISOString(),
        ledgerSummary: ledgerResult,
      });

      const sha256 = crypto.createHash('sha256').update(manifestContent).digest('hex');

      pkg.status = AuditPackageStatus.COMPLETED;
      pkg.sha256Manifest = sha256;
      pkg.summary = { ledgerStatus: ledgerResult.status, currencies: ledgerResult.details.length };
      pkg.downloadUrl = `/admin/audit/packages/${packageId}/download`;
      pkg.completedAt = new Date();

      this.logger.log(`Audit package ${packageId} completed. SHA256: ${sha256}`);
    } catch (err) {
      pkg.status = AuditPackageStatus.FAILED;
      this.logger.error(`Audit package ${packageId} failed`, err);
    }

    await this.packageRepo.save(pkg);
  }
}
