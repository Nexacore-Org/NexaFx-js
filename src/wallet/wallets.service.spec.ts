import { ActivityFeedService } from '../activity-feed/activity-feed.service';
import { WalletsService } from './wallets.service';

describe('WalletsService', () => {
  it('starts balances at zero and normalizes currencies', () => {
    const service = new WalletsService();

    expect(service.getBalance('acct-1', 'usd')).toEqual({
      accountId: 'acct-1',
      currency: 'usd',
      balance: 0,
    });
  });

  it('adjusts balances with two-decimal precision', () => {
    const service = new WalletsService();

    expect(service.adjustBalance('acct-1', 'usd', 10.125)).toEqual({
      accountId: 'acct-1',
      currency: 'usd',
      balance: 10.13,
    });

    expect(service.adjustBalance('acct-1', 'usd', -0.03)).toEqual({
      accountId: 'acct-1',
      currency: 'usd',
      balance: 10.1,
    });
  });

  it('returns balances for an account', () => {
    const service = new WalletsService();

    service.adjustBalance('acct-1', 'usd', 5);
    service.adjustBalance('acct-1', 'eur', 4);
    service.adjustBalance('acct-2', 'usd', 8);

    expect(service.getBalancesForAccount('acct-1')).toEqual([
      {
        accountId: 'acct-1',
        currency: 'usd',
        balance: 5,
      },
      {
        accountId: 'acct-1',
        currency: 'eur',
        balance: 4,
      },
    ]);
  });

  it('emits an activity event when a balance changes', () => {
    const recordActivity = jest.fn();
    const activityFeedService = {
      recordActivity,
    } as unknown as ActivityFeedService;
    const service = new WalletsService(activityFeedService);

    service.adjustBalance('acct-1', 'usd', 12.5);

    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'acct-1',
        type: 'wallet.balance_adjusted',
        securityEvent: false,
      }),
    );
  });
});
