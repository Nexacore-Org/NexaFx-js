import { AdminService } from '../admin/admin.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { MailService } from '../mail/mail.service';

describe('abdulrcrtw Features (Issues #992, #991, #990, #989)', () => {
  it('AdminService supports spread configuration management and audit logging', async () => {
    const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
    const adminService = new AdminService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, mockAudit as any);

    const spreads = adminService.getSpreads();
    expect(spreads['USD/NGN']).toBeDefined();

    const updated = await adminService.updateSpread('USD/NGN', 0.02, 'admin-1');
    expect(updated.spreadPercentage).toBe(0.02);
    expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.spread.update' }));
  });

  it('AdminService impersonates user and logs audit trail', async () => {
    const mockUsers = { findOne: jest.fn().mockResolvedValue({ id: 'target-user', email: 'user@example.com' }) };
    const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };
    const adminService = new AdminService(mockUsers as any, {} as any, {} as any, {} as any, {} as any, {} as any, mockAudit as any);

    const res = await adminService.impersonateUser('target-user', 'admin-1');
    expect(res.impersonatedUserId).toBe('target-user');
    expect(res.token).toBeDefined();
    expect(mockAudit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.user.impersonate' }));
  });

  it('ExchangeRatesService provides lightweight currency conversion calculator', async () => {
    const service = new ExchangeRatesService({} as any, {} as any);
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
