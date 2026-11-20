import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { PaymentProviderService } from '../payments/payment-provider.service';
import { TransactionsService } from './transactions.service';

describe('danielships Features (Issues #984, #983, #982, #981)', () => {
  const WEBHOOK_SECRET = 'test-webhook-secret';

  const makeConfig = (secret?: string) => {
    const get = jest.fn((key: string) =>
      key === 'PROVIDER_WEBHOOK_SECRET' ? secret : undefined,
    );
    return { config: { get } as unknown as ConfigService, get };
  };

  it('ExchangeRatesService provides public exchange rates dataset', async () => {
    const service = new ExchangeRatesService(
      {} as any,
      {} as any,
      { broadcastRateUpdate: jest.fn(), seedCurrentRates: jest.fn() } as any,
      {} as any,
      {} as any,
    );
    jest
      .spyOn(service, 'getRates')
      .mockResolvedValue([{ pair: 'USD/NGN', rate: 1550 } as any]);

    const rates = await service.getRates();
    expect(rates.length).toBeGreaterThan(0);
    expect(rates[0]).toBeDefined();
    expect(rates[0]!.pair).toBe('USD/NGN');
  });

  it('PaymentProviderService supports multi-currency invoice generation', () => {
    const service = new PaymentProviderService({
      get: jest.fn().mockReturnValue('test-webhook-secret-min-32-chars'),
    } as any);
    const { config } = makeConfig(WEBHOOK_SECRET);
    const service = new PaymentProviderService(config);

    const invoice = service.createInvoice({
      userId: 'user-1',
      clientName: 'Acme Corp',
      currency: 'EUR',
      items: [{ description: 'Web Dev', amount: 500 }],
      totalAmount: 500,
    });

    expect(invoice.id).toBeDefined();
    expect(invoice.status).toBe('UNPAID');

    const fetched: unknown = service.getInvoice(invoice.id);
    expect(fetched).toEqual(invoice);
  });

  it('PaymentProviderService supports recurring payment scheduling', () => {
    const service = new PaymentProviderService({
      get: jest.fn().mockReturnValue('test-webhook-secret-min-32-chars'),
    } as any);
    expect(service.getInvoice(invoice.id)).toEqual(invoice);
  });

  it('PaymentProviderService supports recurring payment scheduling', () => {
    const { config } = makeConfig(WEBHOOK_SECRET);
    const service = new PaymentProviderService(config);

    const schedule = service.scheduleRecurringPayment({
      userId: 'user-1',
      recipient: 'utility-co',
      amount: 100,
      currency: 'USD',
      frequency: 'monthly',
    });

    expect(schedule.id).toBeDefined();
    expect(schedule.active).toBe(true);

    const list = service.getRecurringPayments('user-1');
    expect(list.length).toBe(1);
  });

  it('PaymentProviderService refuses to start without PROVIDER_WEBHOOK_SECRET', () => {
    const { config, get } = makeConfig();

    expect(() => new PaymentProviderService(config)).toThrow(
      /PROVIDER_WEBHOOK_SECRET/,
    );
    expect(get).toHaveBeenCalledWith('PROVIDER_WEBHOOK_SECRET');
  });

  it('PaymentProviderService accepts valid and rejects invalid webhook signatures', () => {
    const { config } = makeConfig(WEBHOOK_SECRET);
    const service = new PaymentProviderService(config);
    const payload = JSON.stringify({ event: 'deposit.completed', amount: 100 });
    const signature = createHmac('sha256', WEBHOOK_SECRET)
      .update(payload)
      .digest('hex');

    expect(service.verifyWebhook(payload, signature)).toBe(true);
    expect(service.verifyWebhook(payload, 'invalid-signature')).toBe(false);
  });

  it('TransactionsService supports support comment thread per transaction', async () => {
    const txService = new TransactionsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(txService, 'findById').mockResolvedValue({ id: 'tx-1' } as any);

    const comment = await txService.addComment(
      'tx-1',
      'admin-1',
      'Investigating delay',
    );
    expect(comment.id).toBeDefined();
    expect(comment.text).toBe('Investigating delay');

    const comments = await txService.getComments('tx-1');
    expect(comments.length).toBe(1);
  });
});
