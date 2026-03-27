import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { RegulatoryReport, ReportStatus, ReportType } from '../entities/regulatory-report.entity';

@Injectable()
export class RegulatoryReportingService {
  private ltrThreshold = 10000; // Default $10k threshold

  constructor(
    @InjectRepository(RegulatoryReport)
    private reportRepo: Repository<RegulatoryReport>,
  ) {}

  async setLtrThreshold(newThreshold: number) {
    this.ltrThreshold = newThreshold;
    return { threshold: this.ltrThreshold };
  }

  async generateReport(type: ReportType, txData: any) {
    // Idempotency check: Don't create duplicate LTRs for the same transaction
    if (txData.id) {
      const existing = await this.reportRepo.findOne({ 
        where: { transactionId: txData.id, type } 
      });
      if (existing) return existing;
    }

    const report = this.reportRepo.create({
      type,
      transactionId: txData.id,
      status: ReportStatus.DRAFT,
      data: {
        amount: txData.amount,
        currency: txData.currency,
        sender: txData.senderAddress,
        receiver: txData.recipientAddress,
        timestamp: txData.createdAt,
        narrative: `Automated ${type} generation for transaction ${txData.id}`,
      },
    });

    return this.reportRepo.save(report);
  }

  async fileReport(id: string) {
    const report = await this.reportRepo.findOne({ where: { id } });
    if (!report) throw new NotFoundException('Report not found');
    if (report.status === ReportStatus.FILED) {
      throw new BadRequestException('Report is already filed and immutable');
    }

    report.status = ReportStatus.FILED;
    report.filedAt = new Date();
    return this.reportRepo.save(report);
  }

  async getReports(filters: { type?: ReportType; status?: ReportStatus; start?: Date; end?: Date }) {
    const where: any = {};
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    if (filters.start && filters.end) {
      where.createdAt = Between(filters.start, filters.end);
    }

    return this.reportRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  getThreshold() {
    return this.ltrThreshold;
  }
}