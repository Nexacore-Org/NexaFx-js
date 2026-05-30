import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';

describe('WalletsController', () => {
  const getBalancesForAccountMock = jest.fn();
  const walletsService = {
    getBalancesForAccount: getBalancesForAccountMock,
  } as unknown as WalletsService;
  const controller = new WalletsController(walletsService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns balances for a single account', () => {
    getBalancesForAccountMock.mockReturnValue([
      { accountId: 'acct-1', currency: 'usd', balance: 12 },
    ]);

    expect(controller.getBalances('acct-1')).toEqual([
      { accountId: 'acct-1', currency: 'usd', balance: 12 },
    ]);
    expect(getBalancesForAccountMock).toHaveBeenCalledWith('acct-1');
  });
});
