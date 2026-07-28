import { StellarService } from './stellar/stellar.service';
import { AmlService } from './aml/aml.service';
import { PaymentProviderService } from './payments/payment-provider.service';

describe('ibinola Features (Issues #996, #995, #994, #993)', () => {
  it('StellarService supports NFT receipt minting', async () => {
    const service = new StellarService({ get: () => '' } as any, {} as any);
    const nft = await service.mintReceiptNft('tx-12345', { amount: 100 });
    expect(nft.nftId).toBeDefined();
    expect(nft.transactionId).toBe('tx-12345');
    expect(nft.stellarAssetCode).toBe('RECTX-1');
  });

  it('AmlService calculates real-time transaction fraud score', () => {
    const amlService = new AmlService({} as any, {} as any, {} as any);
    const result = amlService.calculateTransactionFraudScore(12000, 'USD', 2);
    expect(result.score).toBe(80);
    expect(result.riskLevel).toBe('HIGH');
    expect(result.flags).toContain('LARGE_AMOUNT');
    expect(result.flags).toContain('NEW_ACCOUNT');
  });

  it('PaymentProviderService supports bank withdrawal off-ramp', async () => {
    const service = new PaymentProviderService({ get: () => '' } as any);
    const result = await service.processBankWithdrawal({
      userId: 'user-123',
      amount: 500,
      currency: 'NGN',
      bankCode: '058',
      accountNumber: '0123456789',
    });
    expect(result.status).toBe('PROCESSING');
    expect(result.accountNumberMasked).toBe('****6789');
  });

  it('PaymentProviderService supports credit/debit card on-ramp', async () => {
    const service = new PaymentProviderService({ get: () => '' } as any);
    const result = await service.processCardOnRamp({
      userId: 'user-123',
      amount: 100,
      currency: 'USD',
    });
    expect(result.status).toBe('SUCCESS');
    expect(result.redirectUrl).toBeDefined();
  });
});
