import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { CronExpression } from '@nestjs/schedule';
import { LessThanOrEqual, Repository } from 'typeorm';
import { ClusterCron } from '../common/locks/cluster-cron.decorator';
import { CreateScheduledReportDto } from './dto/create-scheduled-report.dto';
import { UpdateScheduledReportDto } from './dto/update-scheduled-report.dto';
import {
  ReportFrequency,
  ReportType,
  ScheduledReport,
} from './entities/scheduled-report.entity';
import {
  ScheduledReportRun,
  ScheduledReportRunStatus,
} from './entities/scheduled-report-run.entity';
import { ReportGenerator } from './generators/report-generator.interface';
import { ScheduledReportDeliveryService } from './scheduled-report-delivery.service';

export const REPORT_GENERATORS = 'REPORT_GENERATORS';

const DEFAULT_MAX_ACTIVE_PER_USER = 10;
const DEFAULT_BACKOFF_MS = 5 * 60 * 1000;
const DUE_REPORT_BATCH_SIZE = 100;

@Injectable()
export class ScheduledReportsService {
  private readonly logger = new Logger(ScheduledReportsService.name);

  constructor(
    @InjectRepository(ScheduledReport)
    private readonly reportRepo: Repository<ScheduledReport>,
    @InjectRepository(ScheduledReportRun)
    private readonly runRepo: Repository<ScheduledReportRun>,
    private readonly config: ConfigService,
    @Inject(REPORT_GENERATORS)
    private readonly generators: ReportGenerator[],
    private readonly delivery: ScheduledReportDeliveryService,
  ) {}

  async create(
    userId: string,
    dto: CreateScheduledReportDto,
  ): Promise<ScheduledReport> {
    const maxActive =
      this.config.get<number>('scheduledReports.maxActivePerUser') ??
      DEFAULT_MAX_ACTIVE_PER_USER;
    const activeCount = await this.reportRepo.count({
      where: { userId, isActive: true },
    });
    if (activeCount >= maxActive) {
      throw new ConflictException(
        `A user may have at most ${maxActive} active scheduled reports`,
      );
    }

    const report = this.reportRepo.create({
      userId,
      reportType: dto.reportType,
      frequency: dto.frequency,
      isActive: true,
      lastRunAt: null,
      nextRunAt: this.computeNextRun(dto.frequency),
    });
    return this.reportRepo.save(report);
  }

  async findByUserId(
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    items: ScheduledReport[];
    total: number;
    page: number;
    limit: number;
  }> {
    const [items, total] = await this.reportRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async deactivate(id: string, userId: string): Promise<ScheduledReport> {
    const report = await this.findOwned(id, userId);
    report.isActive = false;
    return this.reportRepo.save(report);
  }

  async activate(id: string, userId: string): Promise<ScheduledReport> {
    const report = await this.findOwned(id, userId);
    report.isActive = true;
    report.nextRunAt = this.computeNextRun(report.frequency);
    return this.reportRepo.save(report);
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateScheduledReportDto,
  ): Promise<ScheduledReport> {
    const report = await this.findOwned(id, userId);
    if (dto.frequency !== undefined) {
      report.frequency = dto.frequency;
      report.nextRunAt = this.computeNextRun(dto.frequency);
    }
    return this.reportRepo.save(report);
  }

  async remove(id: string, userId: string): Promise<void> {
    const report = await this.findOwned(id, userId);
    await this.reportRepo.remove(report);
  }

  async findRunsByReportId(
    id: string,
    userId: string,
    page = 1,
    limit = 20,
  ): Promise<{
    items: ScheduledReportRun[];
    total: number;
    page: number;
    limit: number;
  }> {
    await this.findOwned(id, userId);
    const [items, total] = await this.runRepo.findAndCount({
      where: { reportId: id, userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  @ClusterCron(CronExpression.EVERY_MINUTE, 'scheduled-reports:process-due')
  async processDueReports(): Promise<void> {
    const now = new Date();
    const due = await this.reportRepo.find({
      where: { isActive: true, nextRunAt: LessThanOrEqual(now) },
      order: { nextRunAt: 'ASC' },
      take: DUE_REPORT_BATCH_SIZE,
    });

    for (const report of due) {
      const periodStart =
        report.lastRunAt ?? this.periodStartForFrequency(now, report.frequency);
      const periodEnd = now;

      try {
        const generator = this.generatorFor(report.reportType);
        const generated = await generator.generate({
          report,
          periodStart,
          periodEnd,
        });
        const run = this.runRepo.create({
          reportId: report.id,
          userId: report.userId,
          status: ScheduledReportRunStatus.SUCCESS,
          periodStart,
          periodEnd,
          payload: generated.payload,
          fileReference: generated.fileReference ?? null,
          error: null,
          deliveredAt: null,
        });
        await this.delivery.deliver(report, generated);
        run.deliveredAt = new Date();
        await this.runRepo.save(run);

        report.lastRunAt = now;
        report.nextRunAt = this.computeNextRun(report.frequency, now);
        await this.reportRepo.save(report);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Scheduled report ${report.id} failed: ${message}`);
        try {
          await this.runRepo.save(
            this.runRepo.create({
              reportId: report.id,
              userId: report.userId,
              status: ScheduledReportRunStatus.FAILED,
              periodStart,
              periodEnd,
              payload: null,
              error: message,
              deliveredAt: null,
            }),
          );
        } catch (runError) {
          this.logger.error(
            `Failed to persist failure run for scheduled report ${report.id}: ${(runError as Error).message}`,
          );
        }
        const backoffMs =
          this.config.get<number>('scheduledReports.backoffMs') ??
          DEFAULT_BACKOFF_MS;
        report.nextRunAt = new Date(now.getTime() + backoffMs);
        await this.reportRepo.save(report);
      }
    }
  }

  private async findOwned(
    id: string,
    userId: string,
  ): Promise<ScheduledReport> {
    const report = await this.reportRepo.findOne({ where: { id, userId } });
    if (!report) {
      throw new NotFoundException(`Scheduled report ${id} not found`);
    }
    return report;
  }

  private generatorFor(reportType: ReportType): ReportGenerator {
    const generator = this.generators.find(
      (candidate) => candidate.reportType === reportType,
    );
    if (!generator) {
      throw new Error(`No generator registered for report type ${reportType}`);
    }
    return generator;
  }

  private periodStartForFrequency(now: Date, frequency: ReportFrequency): Date {
    const start = new Date(now);
    if (frequency === ReportFrequency.WEEKLY) {
      start.setDate(start.getDate() - 7);
    } else if (frequency === ReportFrequency.MONTHLY) {
      start.setMonth(start.getMonth() - 1);
    } else {
      start.setDate(start.getDate() - 1);
    }
    return start;
  }

  private computeNextRun(frequency: ReportFrequency, from = new Date()): Date {
    const next = new Date(from);
    switch (frequency) {
      case ReportFrequency.DAILY:
        next.setDate(next.getDate() + 1);
        break;
      case ReportFrequency.WEEKLY:
        next.setDate(next.getDate() + 7);
        break;
      case ReportFrequency.MONTHLY:
        next.setMonth(next.getMonth() + 1);
        break;
    }
    return next;
  }
}
