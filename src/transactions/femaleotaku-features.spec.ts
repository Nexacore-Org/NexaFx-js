import { TransactionsService } from './transactions.service';
import { FxService } from '../fx/fx.service';
import { AdminService } from '../admin/admin.service';

describe('femaleotaku Features (Issues #988, #987, #986, #985)', () => {
  it('TransactionsService supports user-to-user internal transfer', async () => {
    const mockUsers = { findByEmail: jest.fn().mockResolvedValue({ id: 'recipient-123', email: 'recipient@example.com' }) };
    const txService = new TransactionsService(
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, mockUsers as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );
    jest.spyOn(txService, 'transfer').mockResolvedValue({ id: 'tx-int-1', status: 'COMPLETED' } as any);

    const tx = await txService.createInternalTransfer({
      senderId: 'sender-123',
      recipientEmail: 'recipient@example.com',
      amount: 100,
      currency: 'USD',
    });

    expect(tx.id).toBe('tx-int-1');
    expect(txService.transfer).toHaveBeenCalledWith(expect.objectContaining({ senderId: 'sender-123', receiverId: 'recipient-123' }));
  });

  it('FxService calculates smart swap route comparing DEX liquidity', async () => {
    const mockRate = { getRate: jest.fn().mockResolvedValue({ rate: 1.2 }) };
    const fxService = new FxService({} as any, {} as any, {} as any, mockRate as any, {} as any);

    const route = await fxService.getSmartSwapRoute('USD', 'EUR', 100);
    expect(route.routingType).toBe('SMART_DEX_ROUTING');
    expect(route.estimatedOutput).toBe(120);
  });

  it('AdminService generates CBN monthly compliance report', async () => {
    const mockTxRepo = { count: jest.fn().mockResolvedValue(150) };
    const mockAlertRepo = { count: jest.fn().mockResolvedValue(2) };
    const adminService = new AdminService({} as any, mockTxRepo as any, {} as any, {} as any, {} as any, mockAlertRepo as any, {} as any);

    const report = await adminService.generateCbnComplianceReport('monthly');
    expect(report.reportType).toBe('CBN_MONTHLY_COMPLIANCE_FILING');
    expect(report.metrics.totalTransactionsCount).toBe(150);
  });

  it('TransactionsService simulates swap transaction without DB/blockchain side effects', async () => {
    const mockFees = { calculateFee: jest.fn().mockReturnValue({ feeAmount: 1.0 }) };
    const txService = new TransactionsService(
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, mockFees as any, {} as any, {} as any,
    );

    const sim = await txService.simulateTransaction({
      type: 'swap',
      amount: 100,
      fromCurrency: 'USD',
      toCurrency: 'NGN',
    });

    expect(sim.status).toBe('SIMULATION_SUCCESS');
    expect(sim.estimatedOutput).toBeDefined();
  });
});
