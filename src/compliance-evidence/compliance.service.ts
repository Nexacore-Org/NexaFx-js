import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, FindOptionsWhere } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as crypto from 'crypto';
import { ComplianceReport } from './entities/compliance-report.entity';
import { AuditEvidenceLog } from './entities/audit-evidence-log.entity';
import { GenerateReportDto, ReportFilterDto } from './dto/generate-report.dto';
import { ReportType, ExportFormat, ReportStatus } from './enums/report-type.enum';
import { CountryRule } from './entities/country-rule.entity';

export const COMPLIANCE_QUEUE = 'compliance';
export const GENERATE_REPORT_JOB = 'generate-report';

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);
  private rules = new Map<string, CountryRule>(); // In production, fetch from DB

  constructor(
    @InjectRepository(ComplianceReport)
    private readonly reportRepo: Repository<ComplianceReport>,
    @InjectRepository(AuditEvidenceLog)
    private readonly auditRepo: Repository<AuditEvidenceLog>,
    @InjectQueue(COMPLIANCE_QUEUE)
    private readonly complianceQueue: Queue,
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Enqueue async report generation and return the pending report record. */
  async requestReport(
    dto: GenerateReportDto,
    requestedBy: string,
  ): Promise<ComplianceReport> {
    const report = this.reportRepo.create({
      reportType: dto.reportType,
      exportFormat: dto.exportFormat,
      requestedBy,
      filters: {
        dateFrom: dto.dateFrom,
        dateTo: dto.dateTo,
        userId: dto.userId,
        flaggedOnly: dto.flaggedOnly,
        currency: dto.currency,
      },
      status: ReportStatus.PENDING,
    });

    const saved = await this.reportRepo.save(report);

    await this.complianceQueue.add(
      GENERATE_REPORT_JOB,
      { reportId: saved.id },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    this.logger.log(`Compliance report ${saved.id} queued (${dto.reportType})`);
    return saved;
  }

  

  /** Called by the BullMQ processor — performs actual data collection. */
  async processReport(reportId: string): Promise<void> {
    const report = await this.reportRepo.findOneOrFail({ where: { id: reportId } });

    try {
      await this.reportRepo.update(reportId, { status: ReportStatus.PROCESSING });

      const data = await this.collectData(report);
      const checksum = this.computeChecksum(data);

      await this.reportRepo.update(reportId, {
        status: ReportStatus.COMPLETED,
        reportData: data,
        checksum,
        recordCount: Array.isArray(data.records) ? data.records.length : 0,
        completedAt: new Date(),
      });

      this.logger.log(`Report ${reportId} completed — ${checksum}`);
    } catch (err) {
      await this.reportRepo.update(reportId, {
        status: ReportStatus.FAILED,
        errorMessage: (err as Error).message,
      });
      this.logger.error(`Report ${reportId} failed`, (err as Error).stack);
      throw err;
    }
  }

  async findReport(id: string): Promise<ComplianceReport> {
    const report = await this.reportRepo.findOne({ where: { id } });
    if (!report) throw new NotFoundException(`Report ${id} not found`);
    return report;
  }

  async listReports(filters: ReportFilterDto): Promise<ComplianceReport[]> {
    const where: FindOptionsWhere<ComplianceReport> = {};
    if (filters.reportType) where.reportType = filters.reportType;
    if (filters.dateFrom && filters.dateTo) {
      where.createdAt = Between(
        new Date(filters.dateFrom),
        new Date(filters.dateTo),
      );
    }
    return this.reportRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  /** Export a completed report as CSV or JSON string. */
  async exportReport(id: string): Promise<{ content: string; mimeType: string; filename: string }> {
    const report = await this.findReport(id);
    if (report.status !== ReportStatus.COMPLETED) {
      throw new Error(`Report ${id} is not yet completed (status: ${report.status})`);
    }

    const records: Record<string, unknown>[] = (report.reportData?.records as any[]) ?? [];

    if (report.exportFormat === ExportFormat.CSV) {
      return {
        content: this.toCsv(records),
        mimeType: 'text/csv',
        filename: `compliance-${report.reportType}-${id}.csv`,
      };
    }

    return {
      content: JSON.stringify({ meta: this.buildMeta(report), records }, null, 2),
      mimeType: 'application/json',
      filename: `compliance-${report.reportType}-${id}.json`,
    };
  }

  /** Snapshot current audit evidence logs into a new immutable record. */
  async snapshotAuditEvidence(
    actorId: string,
    actorRole: string,
    filters: { dateFrom?: string; dateTo?: string },
  ): Promise<AuditEvidenceLog> {
    const where: FindOptionsWhere<AuditEvidenceLog> = {};
    if (filters.dateFrom && filters.dateTo) {
      where.createdAt = Between(
        new Date(filters.dateFrom),
        new Date(filters.dateTo),
      );
    }

    const logs = await this.auditRepo.find({ where, order: { createdAt: 'DESC' }, take: 10000 });
    const payload = JSON.stringify(logs);
    const hash = crypto.createHash('sha256').update(payload).digest('hex');

    const snapshot = this.auditRepo.create({
      actorId,
      actorRole,
      action: 'audit_snapshot',
      entityType: 'audit_evidence_log',
      entityId: null,
      before: null,
      after: { count: logs.length, checksum: hash } as any,
      integrityHash: hash,
    });

    return this.auditRepo.save(snapshot);
  }

  /** Create a single audit evidence entry. */
  async recordAuditEvent(params: {
    actorId: string;
    actorRole: string;
    action: string;
    entityType: string;
    entityId?: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<AuditEvidenceLog> {
    const now = new Date().toISOString();
    const raw = `${params.actorId}${params.action}${params.entityId ?? ''}${now}`;
    const integrityHash = crypto.createHash('sha256').update(raw).digest('hex');

    const entry = this.auditRepo.create({ ...params, integrityHash });
    return this.auditRepo.save(entry);
  }

  async verifyChecksum(id: string): Promise<{ valid: boolean; expected: string; actual: string }> {
    const report = await this.findReport(id);
    const actual = this.computeChecksum(report.reportData ?? {});
    return {
      valid: actual === report.checksum,
      expected: report.checksum ?? '',
      actual,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async collectData(report: ComplianceReport): Promise<Record<string, unknown>> {
    const filters = (report.filters ?? {}) as Record<string, unknown>;
    const dateFrom = filters.dateFrom ? new Date(filters.dateFrom as string) : new Date(0);
    const dateTo = filters.dateTo ? new Date(filters.dateTo as string) : new Date();

    switch (report.reportType) {
      case ReportType.TRANSACTION_SUMMARY:
        return this.buildTransactionSummary(dateFrom, dateTo, filters);
      case ReportType.FLAGGED_TRANSACTIONS:
        return this.buildFlaggedTransactions(dateFrom, dateTo, filters);
      case ReportType.USER_ACTIVITY:
        return this.buildUserActivityReport(dateFrom, dateTo, filters);
      case ReportType.AUDIT_SNAPSHOT:
        return this.buildAuditSnapshotReport(dateFrom, dateTo);
      default:
        throw new Error(`Unknown report type: ${report.reportType}`);
    }
  }

  private async buildTransactionSummary(
    dateFrom: Date,
    dateTo: Date,
    filters: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const qb = this.dataSource
      .createQueryBuilder()
      .select([
        'tx.id',
        'tx.userId',
        'tx.amount',
        'tx.currency',
        'tx.status',
        'tx.type',
        'tx.createdAt',
      ])
      .from('transactions', 'tx')
      .where('tx.createdAt BETWEEN :dateFrom AND :dateTo', { dateFrom, dateTo });

    if (filters.userId) qb.andWhere('tx.userId = :userId', { userId: filters.userId });
    if (filters.currency) qb.andWhere('tx.currency = :currency', { currency: filters.currency });

    const records = await qb.getRawMany().catch(() => []);

    const totalAmount = records.reduce((s, r) => s + parseFloat(r.tx_amount ?? '0'), 0);

    return {
      reportType: ReportType.TRANSACTION_SUMMARY,
      generatedAt: new Date().toISOString(),
      period: { from: dateFrom, to: dateTo },
      summary: { totalTransactions: records.length, totalAmount },
      records,
    };
  }

  private async buildFlaggedTransactions(
    dateFrom: Date,
    dateTo: Date,
    filters: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const qb = this.dataSource
      .createQueryBuilder()
      .select(['tx.*'])
      .from('transactions', 'tx')
      .where('tx.createdAt BETWEEN :dateFrom AND :dateTo', { dateFrom, dateTo })
      .andWhere('tx.flaggedForReview = true');

    if (filters.userId) qb.andWhere('tx.userId = :userId', { userId: filters.userId });

    const records = await qb.getRawMany().catch(() => []);

    return {
      reportType: ReportType.FLAGGED_TRANSACTIONS,
      generatedAt: new Date().toISOString(),
      period: { from: dateFrom, to: dateTo },
      summary: { flaggedCount: records.length },
      records,
    };
  }

  private async buildUserActivityReport(
    dateFrom: Date,
    dateTo: Date,
    filters: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const qb = this.dataSource
      .createQueryBuilder()
      .select(['al.userId', 'al.action', 'al.metadata', 'al.createdAt'])
      .from('activity_logs', 'al')
      .where('al.createdAt BETWEEN :dateFrom AND :dateTo', { dateFrom, dateTo });

    if (filters.userId) qb.andWhere('al.userId = :userId', { userId: filters.userId });

    const records = await qb.getRawMany().catch(() => []);

    return {
      reportType: ReportType.USER_ACTIVITY,
      generatedAt: new Date().toISOString(),
      period: { from: dateFrom, to: dateTo },
      summary: { totalEvents: records.length },
      records,
    };
  }

  private async buildAuditSnapshotReport(
    dateFrom: Date,
    dateTo: Date,
  ): Promise<Record<string, unknown>> {
    const records = await this.auditRepo.find({
      where: { createdAt: Between(dateFrom, dateTo) },
      order: { createdAt: 'DESC' },
    });

    return {
      reportType: ReportType.AUDIT_SNAPSHOT,
      generatedAt: new Date().toISOString(),
      period: { from: dateFrom, to: dateTo },
      summary: { totalEntries: records.length },
      records,
    };
  }

  async validateAction(countryCode: string, amount: number, asset: string) {
    const rule = this.rules.get(countryCode);
    
    if (!rule || !rule.isEnabled) {
      throw new ForbiddenException(`Trading not supported in ${countryCode}`);
    }

    if (amount > rule.maxTransactionLimit) {
      throw new ForbiddenException(`Transaction exceeds ${countryCode} limit of ${rule.maxTransactionLimit}`);
    }

    if (rule.restrictedAssets.includes(asset)) {
      throw new ForbiddenException(`Asset ${asset} is restricted in ${countryCode}`);
    }

    return true;
  }

  private computeChecksum(data: Record<string, unknown>): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  private buildMeta(report: ComplianceReport): Record<string, unknown> {
    return {
      reportId: report.id,
      reportType: report.reportType,
      exportFormat: report.exportFormat,
      generatedAt: report.completedAt,
      requestedBy: report.requestedBy,
      checksum: report.checksum,
      recordCount: report.recordCount,
    };
  }

  private toCsv(records: Record<string, unknown>[]): string {
    if (!records.length) return '';
    const headers = Object.keys(records[0]);
    const rows = records.map((r) =>
      headers.map((h) => JSON.stringify(r[h] ?? '')).join(','),
    );
    return [headers.join(','), ...rows].join('\n');
  }
}
