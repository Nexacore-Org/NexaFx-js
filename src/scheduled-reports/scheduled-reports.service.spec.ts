import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  ReportFrequency,
  ReportType,
  ScheduledReport,
} from './entities/scheduled-report.entity';
import { ScheduledReportRunStatus } from './entities/scheduled-report-run.entity';
import { ScheduledReportsService } from './scheduled-reports.service';

describe('ScheduledReportsService', () => {
  const userId = 'user-1';

  function makeReport(
    overrides: Partial<ScheduledReport> = {},
  ): ScheduledReport {
    return {
      id: 'report-1',
      userId,
      reportType: ReportType.TRANSACTION_SUMMARY,
      frequency: ReportFrequency.DAILY,
      nextRunAt: new Date(Date.now() - 1000),
      lastRunAt: null,
      isActive: true,
      createdAt: new Date(),
      ...overrides,
    };
  }

  function makeService(
    options: {
      reports?: Partial<Record<keyof ScheduledReport, unknown>>;
      config?: Record<string, unknown>;
      generate?: jest.Mock;
      deliver?: jest.Mock;
    } = {},
  ) {
    const reportRepo = {
      create: jest.fn((row: Record<string, unknown>) => ({ ...row })),
      save: jest.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      remove: jest.fn().mockResolvedValue(undefined),
      ...options.reports,
    };
    const runRepo = {
      create: jest.fn((row: Record<string, unknown>) => ({ ...row })),
      save: jest.fn((row: Record<string, unknown>) => Promise.resolve(row)),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const config = {
      get: jest.fn((key: string) => options.config?.[key]),
    };
    const generate =
      options.generate ??
      jest.fn().mockResolvedValue({
        payload: { ok: true },
        fileReference: 'report:1',
        emailText: 'ready',
      });
    const deliver = options.deliver ?? jest.fn().mockResolvedValue(undefined);
    const generator = { reportType: ReportType.TRANSACTION_SUMMARY, generate };
    const service = new ScheduledReportsService(
      reportRepo as any,
      runRepo as any,
      config as any,
      [generator],
      { deliver } as any,
    );
    return { service, reportRepo, runRepo, config, generate, deliver };
  }

  it('creates an active report with first run based on frequency', async () => {
    const { service, reportRepo } = makeService();

    const created = await service.create(userId, {
      reportType: ReportType.TRANSACTION_SUMMARY,
      frequency: ReportFrequency.MONTHLY,
    });

    expect(created.userId).toBe(userId);
    expect(created.isActive).toBe(true);
    expect(created.nextRunAt.getTime()).toBeGreaterThan(Date.now());
    expect(reportRepo.save).toHaveBeenCalled();
  });

  it('enforces the active-per-user cap', async () => {
    const { service } = makeService({
      reports: { count: jest.fn().mockResolvedValue(10) },
      config: { 'scheduledReports.maxActivePerUser': 10 },
    });

    await expect(
      service.create(userId, {
        reportType: ReportType.PORTFOLIO,
        frequency: ReportFrequency.DAILY,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('enforces ownership on deactivate and update', async () => {
    const { service } = makeService();

    await expect(service.deactivate('report-1', 'other-user')).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      service.update('report-1', 'other-user', {
        frequency: ReportFrequency.WEEKLY,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('paginates reports and runs', async () => {
    const { service, reportRepo, runRepo } = makeService({
      reports: {
        findOne: jest.fn().mockResolvedValue(makeReport()),
        findAndCount: jest.fn().mockResolvedValue([[], 0]),
      },
    });

    await expect(service.findByUserId(userId, 2, 5)).resolves.toEqual({
      items: [],
      total: 0,
      page: 2,
      limit: 5,
    });
    expect(reportRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 }),
    );

    await service.findRunsByReportId('report-1', userId, 3, 10);
    expect(runRepo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reportId: 'report-1', userId },
        skip: 20,
      }),
    );
  });

  it('generates, delivers, records a run, and advances due reports', async () => {
    const report = makeReport();
    const { service, reportRepo, runRepo, generate, deliver } = makeService({
      reports: { find: jest.fn().mockResolvedValue([report]) },
    });

    await service.processDueReports();

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        report,
        periodStart: expect.any(Date) as Date,
        periodEnd: expect.any(Date) as Date,
      }),
    );
    expect(deliver).toHaveBeenCalledWith(
      report,
      expect.objectContaining({ emailText: 'ready' }),
    );
    expect(runRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ScheduledReportRunStatus.SUCCESS,
        reportId: report.id,
        deliveredAt: expect.any(Date) as Date,
      }),
    );
    expect(report.isActive).toBe(true);
    expect(report.nextRunAt.getTime()).toBeGreaterThan(Date.now());
    expect(reportRepo.save).toHaveBeenCalledWith(report);
  });

  it('records failed runs and backs off without disabling the report', async () => {
    const report = makeReport();
    const error = new Error('generator failed');
    const { service, runRepo } = makeService({
      reports: { find: jest.fn().mockResolvedValue([report]) },
      generate: jest.fn().mockRejectedValue(error),
      config: { 'scheduledReports.backoffMs': 60000 },
    });

    await service.processDueReports();

    expect(runRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ScheduledReportRunStatus.FAILED,
        error: 'generator failed',
      }),
    );
    expect(report.isActive).toBe(true);
    expect(report.nextRunAt.getTime()).toBeGreaterThan(Date.now() + 30000);
  });

  it('removes a report owned by the user', async () => {
    const report = makeReport();
    const { service, reportRepo } = makeService({
      reports: { findOne: jest.fn().mockResolvedValue(report) },
    });

    await service.remove(report.id, userId);

    expect(reportRepo.remove).toHaveBeenCalledWith(report);
  });
});
