import { ForbiddenException } from '@nestjs/common';
import { FxService } from './fx.service';

describe('FxService account freeze enforcement', () => {
  it('rejects a swap from a frozen account before touching balances', async () => {
    const freeze = { assertNotFrozen: jest.fn().mockRejectedValue(new ForbiddenException('frozen')) };
    const dataSource = { transaction: jest.fn() };
    const rates = { getRate: jest.fn() };
    const wallets = { adjustBalance: jest.fn() };
    const service = new FxService(
      {} as any,
      dataSource as any,
      {} as any,
      rates as any,
      wallets as any,
      freeze as any,
    );

    await expect(
      service.executeTrade({ userId: 'u1', fromCurrency: 'USD', toCurrency: 'NGN', fromAmount: 5 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(wallets.adjustBalance).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});
