import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdminService } from '../admin/admin.service';
import { AuditService } from '../audit/audit.service';
import { User } from '../users/user.entity';
import { Transaction } from '../transactions/transaction.entity';
import { KycDocument } from '../kyc/kyc-document.entity';
import { SupportTicketEntity } from '../modules/support-tickets/entities/support-ticket.entity';
import { WebhookEndpoint } from '../webhooks/webhook-endpoint.entity';
import { AmlAlert } from '../aml/aml-alert.entity';
import { AdminApproval } from './admin-approval.entity';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { MailService } from '../mail/mail.service';

/**
 * Builds AdminService through Nest DI instead of positionally, so adding or
 * reordering constructor dependencies cannot silently put a mock in the wrong slot.
 */
async function buildAdminService(overrides: { users?: object; audit?: object } = {}) {
  const repo = () => ({ findOne: jest.fn(), find: jest.fn(), count: jest.fn(), save: jest.fn() });
  const module = await Test.createTestingModule({
    providers: [
      AdminService,
      { provide: getRepositoryToken(User), useValue: overrides.users ?? repo() },
      { provide: getRepositoryToken(Transaction), useValue: repo() },
      { provide: getRepositoryToken(KycDocument), useValue: repo() },
      { provide: getRepositoryToken(SupportTicketEntity), useValue: repo() },
      { provide: getRepositoryToken(WebhookEndpoint), useValue: repo() },
      { provide: getRepositoryToken(AmlAlert), useValue: repo() },
      { provide: getRepositoryToken(AdminApproval), useValue: repo() },
      { provide: AuditService, useValue: overrides.audit ?? { log: jest.fn().mockResolvedValue(undefined) } },
    ],
  }).compile();
  return module.get(AdminService);
}

describe('abdulrcrtw Features (Issues #992, #991, #990, #989)', () => {
  it('AdminService supports spread configuration management and audit logging', async () => {
    const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
    const adminService = new AdminService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, mockAudit as any);

    const spreads = adminService.getSpreads();
    expect(spreads['USD/NGN']).toBeDefined();

    const updated = await adminService.updateSpread('USD/NGN', 0.02, 'admin-1');
    expect(updated.spreadPercentage).toBe(0.02);
    expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.spread.update' }));
  });

  it('AdminService impersonates user and logs audit trail', async () => {
    const mockUsers = { findOne: jest.fn().mockResolvedValue({ id: 'target-user', email: 'user@example.com', role: 'user' }) };
    const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
    const mockJwt = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    const adminService = new AdminService(
      mockUsers as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, mockAudit as any, mockJwt as any,
    );

    const res = await adminService.impersonateUser('target-user', 'admin-1', 'Investigating support ticket #1234');
    expect(res.impersonatedUserId).toBe('target-user');
    expect(res.token).toBe('signed.jwt.token');
    expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.user.impersonate', userId: 'admin-1' }));
  });

  it('ExchangeRatesService provides lightweight currency conversion calculator', async () => {
    const service = new ExchangeRatesService({} as any, {} as any, { broadcastRateUpdate: jest.fn(), seedCurrentRates: jest.fn() } as any);
    jest.spyOn(service, 'getRateByPair').mockResolvedValue({ rate: 1500 } as any);

    const result = await service.calculateConversion('USD', 'NGN', 10);
    expect(result.convertedAmount).toBe(15000);
    expect(result.rate).toBe(1500);
  });

  it('MailService supports queuing daily digest emails', () => {
    const mailService = new MailService();
    expect(() =>
      mailService.sendDailyDigestEmail({
        to: 'user@example.com',
        fullName: 'Jane Doe',
        date: '2026-07-27',
        transactionCount: 5,
        totalVolume: 250,
      }),
    ).not.toThrow();
  });
});
