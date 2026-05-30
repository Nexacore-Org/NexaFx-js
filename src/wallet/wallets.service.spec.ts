import { ActivityFeedService } from '../activity-feed/activity-feed.service';
import { WalletsService } from './wallets.service';

describe('WalletsService', () => {
  let service: WalletsService;

  beforeEach(() => {
    service = new WalletsService();
  });

  it('adjusts balances with two-decimal precision', () => {
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
    const recordActivityMock = jest.fn();
    const activityFeedService = {
      recordActivity: recordActivityMock,
    } as unknown as ActivityFeedService;
    const walletService = new WalletsService(activityFeedService);

    walletService.adjustBalance('acct-1', 'usd', 12.5);

    expect(recordActivityMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'acct-1',
        type: 'wallet.balance_adjusted',
        securityEvent: false,
      }),
    );
  });
});
