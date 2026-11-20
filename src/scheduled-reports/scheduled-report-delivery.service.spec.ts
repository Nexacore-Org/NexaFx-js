import { ScheduledReportDeliveryService } from './scheduled-report-delivery.service';
import {
  ReportFrequency,
  ReportType,
  ScheduledReport,
} from './entities/scheduled-report.entity';

describe('ScheduledReportDeliveryService', () => {
  const report = {
    id: 'report-1',
    userId: 'user-1',
    reportType: ReportType.PORTFOLIO,
    frequency: ReportFrequency.DAILY,
  } as ScheduledReport;
  const generated = { payload: {}, emailText: 'Your report is ready: <safe>' };

  it('queues an email when the queue is enabled', async () => {
    const users = {
      findById: jest.fn().mockResolvedValue({ email: 'user@example.com' }),
    };
    const emailQueue = { enqueue: jest.fn().mockResolvedValue(true) };
    const mail = { sendRaw: jest.fn() };
    const service = new ScheduledReportDeliveryService(
      users as any,
      emailQueue as any,
      mail as any,
    );

    await service.deliver(report, generated);

    expect(emailQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        text: generated.emailText,
      }),
    );
    expect(mail.sendRaw).not.toHaveBeenCalled();
  });

  it('falls back to direct mail and escapes HTML', async () => {
    const users = {
      findById: jest.fn().mockResolvedValue({ email: 'user@example.com' }),
    };
    const emailQueue = { enqueue: jest.fn().mockResolvedValue(false) };
    const mail = { sendRaw: jest.fn().mockResolvedValue(undefined) };
    const service = new ScheduledReportDeliveryService(
      users as any,
      emailQueue as any,
      mail as any,
    );

    await service.deliver(report, generated);

    const payload = mail.sendRaw.mock.calls[0][0] as { html: string };
    expect(payload.html).toContain('&lt;safe&gt;');
  });
});
