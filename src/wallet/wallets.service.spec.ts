import { WalletsService } from './wallets.service';

describe('WalletsService', () => {
  let service: WalletsService;

  beforeEach(() => {
    service = new WalletsService();
  });

  it('starts accounts at zero and normalizes currencies', () => {
    expect(service.getBalance('acct-1', 'usd')).toEqual({
      accountId: 'acct-1',
      currency: 'usd',
      balance: 0,
    });
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

  it('returns all balances for an account', () => {
    service.adjustBalance('acct-1', 'usd', 10.125);
    service.adjustBalance('acct-1', 'eur', 4);
    service.adjustBalance('acct-2', 'usd', 5);

    expect(service.getBalancesForAccount('acct-1')).toEqual([
      {
        accountId: 'acct-1',
        currency: 'usd',
        balance: 10.13,
      },
      {
        accountId: 'acct-1',
        currency: 'eur',
        balance: 4,
      },
    ]);
  });
});
