import { WebhookClient } from '../src/webhook-client';
import { parseWebhookEvent } from '../src/event-types';
import { computeSignature } from '../src/webhook-verifier';

describe('NexaFx Webhooks SDK', () => {
  const secret = 'top-secret';
  const timestamp = '1711368000';
  const payload = JSON.stringify({
    transactionId: 'txn-1',
    timestamp: '2026-03-25T11:00:00.000Z',
    amount: 250,
    currency: 'USD',
  });

  it('verifies a valid signature', () => {
    const client = new WebhookClient('https://api.nexafx.test');
    const signature = computeSignature(secret, timestamp, payload);

    expect(
      client.verifySignature({
        secret,
        payload,
        signatureHeader: signature,
        timestampHeader: timestamp,
      }),
    ).toBe(true);
  });

  it('rejects an invalid signature', () => {
    const client = new WebhookClient('https://api.nexafx.test');

    expect(
      client.verifySignature({
        secret,
        payload,
        signatureHeader: 'sha256=deadbeef',
        timestampHeader: timestamp,
      }),
    ).toBe(false);
  });

  it('parses supported event types into typed webhook events', () => {
    const event = parseWebhookEvent('transaction.created', JSON.parse(payload));

    expect(event.eventType).toBe('transaction.created');
    expect(event.payload.transactionId).toBe('txn-1');
    expect(event.payload.amount).toBe(250);
  });

  it('rejects unsupported event type parsing', () => {
    expect(() =>
      parseWebhookEvent('transaction.unknown' as never, {}),
    ).toThrow('Unsupported NexaFx event type');
  });
});
