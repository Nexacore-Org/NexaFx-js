import { UnprocessableEntityException } from '@nestjs/common';
import { WalletsService } from './wallets.service';

describe('WalletsService', () => {
  let walletsService: WalletsService;

  beforeEach(() => {
    walletsService = new WalletsService();
  });

  it('allows a debit that lands exactly on zero', () => {
    walletsService.adjustBalance('account-1', 'usd', 5);

    expect(walletsService.adjustBalance('account-1', 'usd', -5)).toMatchObject({
      accountId: 'account-1',
      currency: 'usd',
      balance: 0,
    });
  });

  it('rejects a debit that would make the balance negative', () => {
    expect(() =>
      walletsService.adjustBalance('account-1', 'usd', -0.01),
    ).toThrowError(new UnprocessableEntityException('Insufficient funds'));
  });
});
