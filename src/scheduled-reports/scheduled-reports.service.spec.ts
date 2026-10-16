import { NotFoundException } from '@nestjs/common';
import { NotificationPreferencesService } from '../notification-preferences/notification-preferences.service';
import {
  NotificationChannel,
  NotificationEventType,
} from '../notification-preferences/notification-preference.entity';
import {
  ScheduledReportsService,
} from './scheduled-reports.service';
import { ReportType, ReportFrequency } from './entities/scheduled-report.entity';

describe('NotificationPreferencesService', () => {
  it('returns true when no preference row exists', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new NotificationPreferencesService(repo as any);
    await expect(
      service.shouldNotify('u1', NotificationChannel.EMAIL, NotificationEventType.SECURITY),
    ).resolves.toBe(true);
  });

  it('honors an explicit isEnabled flag', async () => {
    const repo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ isEnabled: false }),
    };
    const service = new NotificationPreferencesService(repo as any);
    await expect(
      service.shouldNotify('u1', NotificationChannel.PUSH, NotificationEventType.KYC),
    ).resolves.toBe(false);
  });

  it('creates a preference when none exists for the pair', async () => {
    const created = { isEnabled: true, batchingEnabled: true };
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn((dto) => Promise.resolve({ ...created, ...dto })),
    };
    const service = new NotificationPreferencesService(repo as any);
    const result = await service.updatePreference('u1', {
      channel: NotificationChannel.EMAIL,
      eventType: NotificationEventType.TRANSACTION,
      isEnabled: true,
    });
    expect(result.isEnabled).toBe(true);
    expect(result.batchingEnabled).toBe(true);
  });
});

describe('ScheduledReportsService', () => {
  it('schedules the first run from the requested frequency', async () => {
    const repo = {
      create: jest.fn((row) => ({ ...row })),
      save: jest.fn((row) => Promise.resolve(row)),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    const service = new ScheduledReportsService(repo as any);
    const created = await service.create({
      userId: 'u1',
      reportType: ReportType.FEE_SUMMARY,
      frequency: ReportFrequency.DAILY,
    });
    expect(created.nextRunAt.getTime()).toBeGreaterThan(Date.now());
    expect(created.userId).toBe('u1');
  });

  it('throws when deactivating an unknown report', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new ScheduledReportsService(repo as any);
    await expect(service.deactivate('missing-id')).rejects.toThrow(
      NotFoundException,
    );
  });
});
