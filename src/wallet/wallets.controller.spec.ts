import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';

describe('WalletsController', () => {
  const getBalancesForAccountMock = jest.fn();
  const adjustBalanceMock = jest.fn();
  const walletsService = {
    getBalancesForAccount: getBalancesForAccountMock,
    adjustBalance: adjustBalanceMock,
  } as unknown as WalletsService;
  const controller = new WalletsController(walletsService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns balances for a single account', () => {
    getBalancesForAccountMock.mockReturnValue([
      { accountId: 'acct-1', currency: 'USD', balance: 12 },
    ]);

    expect(controller.getBalances('acct-1')).toEqual([
      { accountId: 'acct-1', currency: 'USD', balance: 12 },
    ]);
    expect(getBalancesForAccountMock).toHaveBeenCalledWith('acct-1');
  });

  it('uses the DTO payload for balance adjustments', () => {
    adjustBalanceMock.mockReturnValue({
      accountId: 'acct-1',
      currency: 'USD',
      balance: 50,
    });

    expect(
      controller.adjustBalance({
        accountId: 'acct-1',
        currency: 'USD',
        delta: 50,
      }),
    ).toEqual({ accountId: 'acct-1', currency: 'USD', balance: 50 });
    expect(adjustBalanceMock).toHaveBeenCalledWith('acct-1', 'USD', 50);
  });
});
