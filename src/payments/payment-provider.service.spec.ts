import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { PaymentProviderService } from './payment-provider.service';

const SECRET = 'w'.repeat(32);

const makeConfig = (values: Record<string, string | undefined>) =>
  ({ get: jest.fn((key: string) => values[key]) }) as unknown as ConfigService;

describe('PaymentProviderService webhook verification', () => {
  it('refuses to start when PROVIDER_WEBHOOK_SECRET is unset', () => {
    expect(() => new PaymentProviderService(makeConfig({}))).toThrow(
      'PROVIDER_WEBHOOK_SECRET is not configured',
    );
  });

  it('accepts a correctly signed payload', () => {
    const svc = new PaymentProviderService(makeConfig({ PROVIDER_WEBHOOK_SECRET: SECRET }));
    const payload = '{"event":"deposit"}';
    const signature = createHmac('sha256', SECRET).update(payload).digest('hex');
    expect(svc.verifyWebhook(payload, signature)).toBe(true);
  });

  it('rejects a forged signature', () => {
    const svc = new PaymentProviderService(makeConfig({ PROVIDER_WEBHOOK_SECRET: SECRET }));
    const payload = '{"event":"deposit"}';
    const forged = createHmac('sha256', 'secret').update(payload).digest('hex');
    expect(svc.verifyWebhook(payload, forged)).toBe(false);
  });

  it('rejects a tampered payload and a malformed signature without throwing', () => {
    const svc = new PaymentProviderService(makeConfig({ PROVIDER_WEBHOOK_SECRET: SECRET }));
    const signature = createHmac('sha256', SECRET).update('original').digest('hex');
    expect(svc.verifyWebhook('tampered', signature)).toBe(false);
    expect(svc.verifyWebhook('original', 'short')).toBe(false);
    expect(svc.verifyWebhook('original', '')).toBe(false);
  });
});
