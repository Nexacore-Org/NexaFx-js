import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, createSign } from 'crypto';

export type PackageStatus = 'pending' | 'generating' | 'complete' | 'failed';

export interface PackageFile {
  name: string;
  content: string;
  checksum: string;
}

export interface EvidencePackage {
  id: string;
  requestedBy: string;
  status: PackageStatus;
  files: PackageFile[];
  manifestHash?: string;
  manifestSignature?: string;
  generatedAt?: Date;
  expiresAt?: Date;
  documentCount: number;
}

export interface ChainOfCustodyRecord {
  packageId: string;
  requestedBy: string;
  generatedAt: Date;
  documentCount: number;
  manifestHash: string;
}

@Injectable()
export class EvidencePackageService {
  private readonly logger = new Logger(EvidencePackageService.name);
  private readonly packages: Map<string, EvidencePackage> = new Map();
  private readonly custodyLog: ChainOfCustodyRecord[] = [];
  private readonly EXPIRY_DAYS = 90;

  async requestPackage(requestedBy: string, filters?: Record<string, unknown>): Promise<string> {
    const id = crypto.randomUUID();
    const pkg: EvidencePackage = {
      id,
      requestedBy,
      status: 'pending',
      files: [],
      documentCount: 0,
    };
    this.packages.set(id, pkg);
    this.logger.log(`Evidence package requested: ${id} by ${requestedBy}`);

    setImmediate(() => this.generate(id, requestedBy, filters));
    return id;
  }

  async getPackage(id: string): Promise<EvidencePackage> {
    const pkg = this.packages.get(id);
    if (!pkg) throw new NotFoundException(`Evidence package ${id} not found`);
    return pkg;
  }

  listPackages(): EvidencePackage[] {
    return Array.from(this.packages.values());
  }

  verifyPackage(id: string): { status: 'VALID' | 'INVALID'; reason?: string } {
    const pkg = this.packages.get(id);
    if (!pkg) return { status: 'INVALID', reason: 'Package not found' };
    if (pkg.status !== 'complete') return { status: 'INVALID', reason: 'Package not complete' };
    if (pkg.expiresAt && pkg.expiresAt < new Date()) return { status: 'INVALID', reason: 'Package expired' };
    return { status: 'VALID' };
  }

  private async generate(id: string, requestedBy: string, _filters?: Record<string, unknown>): Promise<void> {
    const pkg = this.packages.get(id)!;
    pkg.status = 'generating';

    try {
      const files: PackageFile[] = [
        this.buildFile('transaction-records.json', { records: [], generatedAt: new Date() }),
        this.buildFile('aml-logs.json', { logs: [], generatedAt: new Date() }),
        this.buildFile('compliance-cases.json', { cases: [], generatedAt: new Date() }),
        this.buildFile('audit-trail.json', { events: [], generatedAt: new Date() }),
      ];

      const manifest = {
        packageId: id,
        requestedBy,
        generatedAt: new Date(),
        files: files.map((f) => ({ name: f.name, checksum: f.checksum })),
      };

      const manifestContent = JSON.stringify(manifest, null, 2);
      const manifestHash = createHash('sha256').update(manifestContent).digest('hex');
      const manifestFile = this.buildFile('manifest.json', manifest);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.EXPIRY_DAYS);

      pkg.files = [...files, manifestFile];
      pkg.manifestHash = manifestHash;
      pkg.documentCount = files.length;
      pkg.status = 'complete';
      pkg.generatedAt = new Date();
      pkg.expiresAt = expiresAt;

      this.custodyLog.push({
        packageId: id,
        requestedBy,
        generatedAt: new Date(),
        documentCount: files.length,
        manifestHash,
      });

      this.logger.log(`Evidence package complete: ${id} (${files.length} documents)`);
    } catch (err) {
      pkg.status = 'failed';
      this.logger.error(`Evidence package generation failed: ${id}`, err);
    }
  }

  private buildFile(name: string, data: unknown): PackageFile {
    const content = JSON.stringify(data, null, 2);
    const checksum = createHash('sha256').update(content).digest('hex');
    return { name, content, checksum };
  }

  getCustodyLog(): ChainOfCustodyRecord[] {
    return [...this.custodyLog];
  }
}
