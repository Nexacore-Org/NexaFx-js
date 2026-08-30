import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { NotificationPreferencesService } from '../notification-preferences/notification-preferences.service';
import {
  NotificationChannel,
  NotificationEventType,
} from '../notification-preferences/notification-preference.entity';
import {
  ScheduledReportsService,
} from './scheduled-reports.service';
import { ReportType, ReportFrequency } from './entities/scheduled-report.entity';
import { TermsController } from '../terms/terms.controller';

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

describe('TermsController', () => {
  it('records acceptance for the authenticated user', async () => {
    const termsService = {
      accept: jest.fn().mockResolvedValue({ userId: 'u1', version: '1.0' }),
    };
    const controller = new TermsController(termsService as any);
    const result = await controller.accept({
      user: { sub: 'u1' },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
    } as any);
    expect(termsService.accept).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1' }),
    );
    expect(result.userId).toBe('u1');
  });

  it('rejects requests without an authenticated user', async () => {
    const controller = new TermsController({ accept: jest.fn() } as any);
    await expect(controller.accept({} as any)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});