import { ScheduledReportsController } from './scheduled-reports.controller';
import {
  ReportFrequency,
  ReportType,
} from './entities/scheduled-report.entity';

describe('ScheduledReportsController', () => {
  const userId = 'user-1';

  function makeController() {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 'report-1' }),
      findByUserId: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      findRunsByReportId: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      update: jest.fn().mockResolvedValue({ id: 'report-1' }),
      deactivate: jest.fn().mockResolvedValue({ id: 'report-1' }),
      activate: jest.fn().mockResolvedValue({ id: 'report-1' }),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    return {
      controller: new ScheduledReportsController(service as any),
      service,
    };
  }

  it('creates reports for the authenticated user', async () => {
    const { controller, service } = makeController();
    const dto = {
      reportType: ReportType.TRANSACTION_SUMMARY,
      frequency: ReportFrequency.DAILY,
    };

    await controller.create(dto, userId);

    expect(service.create).toHaveBeenCalledWith(userId, dto);
  });

  it('passes ownership and pagination to the service', async () => {
    const { controller, service } = makeController();

    await controller.findAll({ page: 2, limit: 10 }, userId);
    await controller.findRuns('report-1', { page: 1, limit: 5 }, userId);
    await controller.deactivate('report-1', userId);
    await controller.activate('report-1', userId);
    await controller.remove('report-1', userId);

    expect(service.findByUserId).toHaveBeenCalledWith(userId, 2, 10);
    expect(service.findRunsByReportId).toHaveBeenCalledWith(
      'report-1',
      userId,
      1,
      5,
    );
    expect(service.deactivate).toHaveBeenCalledWith('report-1', userId);
    expect(service.activate).toHaveBeenCalledWith('report-1', userId);
    expect(service.remove).toHaveBeenCalledWith('report-1', userId);
  });
});
