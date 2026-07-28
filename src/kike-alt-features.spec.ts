import { AdminService } from './admin/admin.service';
import { AdminAlertService } from './admin/admin-alert.service';
import { CurrenciesService } from './currencies/currencies.service';
import { UsersService } from './users/users.service';

describe('kike-alt Features (Issues #980, #979, #978, #977)', () => {
  it('AdminService performs platform-wide search across users and transactions', async () => {
    const mockUsers = { find: jest.fn().mockResolvedValue([{ id: 'u-1', email: 'test@example.com' }]) };
    const mockTx = { find: jest.fn().mockResolvedValue([{ id: 'tx-1', reference: 'ref-123' }]) };
    const adminService = new AdminService(mockUsers as any, mockTx as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    const res = await adminService.searchPlatform('test');
    expect(res.query).toBe('test');
    expect(res.results.users.length).toBe(1);
  });

  it('AdminAlertService broadcasts and records admin alerts', async () => {
    const alertService = new AdminAlertService({ get: () => '' } as any, {} as any, { get: jest.fn(), set: jest.fn() } as any);
    const alert = await alertService.broadcastAlert({
      type: 'high_volatility',
      severity: 'high',
      title: 'Market Spike',
      message: 'USD/NGN spiked by 5%',
    });

    expect(alert.id).toBeDefined();
    const recent = alertService.getRecentAlerts();
    expect(recent.length).toBe(1);
  });

  it('CurrenciesService supports converting assets across different issuers', () => {
    const service = new CurrenciesService({ get: () => [] } as any);
    const result = service.convertAssetIssuer('USDC', 'G-ISSUER-A', 'G-ISSUER-B', 100);

    expect(result.convertedAmount).toBe(99.9);
    expect(result.fee).toBe(0.1);
  });

  it('UsersService supports GDPR data portability package generation', async () => {
    const mockUsersRepo = { findOne: jest.fn().mockResolvedValue({ id: 'u-123', email: 'user@example.com' }) };
    const service = new UsersService(mockUsersRepo as any, {} as any, {} as any);

    const data = await service.exportUserData('u-123');
    expect(data.exportId).toBeDefined();
    expect(data.userData.exportedSections).toContain('profile');
  });
});
