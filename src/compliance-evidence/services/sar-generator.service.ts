import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RegulatoryReport,
  ReportStatus,
  ReportType,
} from '../entities/regulatory-report.entity';

export interface SarPayload {
  caseId: string;
  userId: string;
  triggeredRules: string[];
  transactionIds: string[];
  riskScore: number;
  narrative?: string;
}

@Injectable()
export class SarGeneratorService {
  private readonly logger = new Logger(SarGeneratorService.name);

  constructor(
    @InjectRepository(RegulatoryReport)
    private readonly reportRepo: Repository<RegulatoryReport>,
  ) {}

  async generateSar(payload: SarPayload): Promise<RegulatoryReport> {
    const existing = await this.reportRepo.findOne({
      where: { transactionId: payload.caseId, type: ReportType.SAR },
    });
    if (existing) {
      this.logger.log(`SAR already exists for case ${payload.caseId}`);
      return existing;
    }

    const report = this.reportRepo.create({
      type: ReportType.SAR,
      status: ReportStatus.DRAFT,
      transactionId: payload.caseId,
      data: {
        caseId: payload.caseId,
        userId: payload.userId,
        triggeredRules: payload.triggeredRules,
        transactionIds: payload.transactionIds,
        riskScore: payload.riskScore,
        narrative: payload.narrative ?? 'Auto-generated SAR from compliance case',
        generatedAt: new Date().toISOString(),
      },
    });

    const saved = await this.reportRepo.save(report);
    this.logger.log(`SAR created: ${saved.id} for case ${payload.caseId}`);
    return saved;
  }

  async fileSar(
    reportId: string,
    filerId: string,
  ): Promise<RegulatoryReport> {
    const report = await this.reportRepo.findOneOrFail({ where: { id: reportId } });

    if (report.status === ReportStatus.FILED) {
      return report;
    }

    report.status = ReportStatus.FILED;
    report.filedAt = new Date();
    report.data = { ...report.data, filedBy: filerId };

    return this.reportRepo.save(report);
  }

  async listSars(status?: ReportStatus): Promise<RegulatoryReport[]> {
    const where: Partial<RegulatoryReport> = { type: ReportType.SAR };
    if (status) where.status = status;
    return this.reportRepo.find({ where, order: { createdAt: 'DESC' } });
  }
}
