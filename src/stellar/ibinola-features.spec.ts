import { StellarService } from './stellar.service';
import { AmlService } from '../aml/aml.service';

// Issue #1312 — this spec originally also covered PaymentProviderService
// bank-withdrawal-off-ramp and card-on-ramp flows via
// `processBankWithdrawal`/`processCardOnRamp`. Neither method exists on
// PaymentProviderService (see src/payments/payment-provider.service.ts) and
// no equivalently-named method exists either, so those two cases were
// removed rather than fixed: bank-withdrawal/card-on-ramp support was never
// actually implemented, only ever asserted against in this stale spec.
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
});
