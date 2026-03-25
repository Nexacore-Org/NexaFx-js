import {
  TRANSACTION_COMPLETED,
  TRANSACTION_CREATED,
  TRANSACTION_FAILED,
  TRANSACTION_PROCESSING,
} from '../transactions/events';

export interface WebhookEventCatalogEntry {
  eventName: string;
  displayName: string;
  description: string;
  samplePayload: Record<string, any>;
}

export const WEBHOOK_EVENT_CATALOG: WebhookEventCatalogEntry[] = [
  {
    eventName: TRANSACTION_CREATED,
    displayName: 'Transaction Created',
    description: 'Sent when a transaction record is created and committed.',
    samplePayload: {
      transactionId: '4f1d1f0e-a7f2-4d61-96b2-d9b5b537af11',
      timestamp: '2026-03-25T11:00:00.000Z',
      amount: 1250.5,
      currency: 'USD',
      metadata: {
        source: 'api',
        customerReference: 'INV-1002',
      },
      payload: {
        walletId: 'wallet-01',
        toAddress: '0xabc123',
      },
    },
  },
  {
    eventName: TRANSACTION_PROCESSING,
    displayName: 'Transaction Processing',
    description: 'Sent when a transaction enters active processing.',
    samplePayload: {
      transactionId: '4f1d1f0e-a7f2-4d61-96b2-d9b5b537af11',
      timestamp: '2026-03-25T11:00:05.000Z',
      startedAt: '2026-03-25T11:00:05.000Z',
    },
  },
  {
    eventName: TRANSACTION_COMPLETED,
    displayName: 'Transaction Completed',
    description: 'Sent when a transaction completes successfully.',
    samplePayload: {
      transactionId: '4f1d1f0e-a7f2-4d61-96b2-d9b5b537af11',
      timestamp: '2026-03-25T11:00:20.000Z',
      completedAt: '2026-03-25T11:00:20.000Z',
      durationMs: 15000,
      metadata: {
        settlementChannel: 'bank-transfer',
      },
    },
  },
  {
    eventName: TRANSACTION_FAILED,
    displayName: 'Transaction Failed',
    description: 'Sent when a transaction fails after processing.',
    samplePayload: {
      transactionId: '4f1d1f0e-a7f2-4d61-96b2-d9b5b537af11',
      timestamp: '2026-03-25T11:00:20.000Z',
      failedAt: '2026-03-25T11:00:20.000Z',
      errorMessage: 'Beneficiary bank rejected transfer',
      errorCode: 'BANK_REJECTED',
      retryable: false,
      meta: {
        supportReference: 'SUP-7781',
      },
    },
  },
];

export const WEBHOOK_EVENT_NAMES = WEBHOOK_EVENT_CATALOG.map((entry) => entry.eventName);

export function getWebhookEventCatalogEntry(
  eventName: string,
): WebhookEventCatalogEntry | undefined {
  return WEBHOOK_EVENT_CATALOG.find((entry) => entry.eventName === eventName);
}
