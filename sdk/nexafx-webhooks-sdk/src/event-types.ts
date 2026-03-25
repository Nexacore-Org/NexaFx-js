export const NEXAFX_EVENT_TYPES = [
  'transaction.created',
  'transaction.processing',
  'transaction.completed',
  'transaction.failed',
] as const;

export type NexaFxEventType = (typeof NEXAFX_EVENT_TYPES)[number];

export interface TransactionCreatedEvent {
  transactionId: string;
  timestamp: string;
  amount: number;
  currency: string;
  metadata?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

export interface TransactionProcessingEvent {
  transactionId: string;
  timestamp: string;
  startedAt: string;
}

export interface TransactionCompletedEvent {
  transactionId: string;
  timestamp: string;
  completedAt: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface TransactionFailedEvent {
  transactionId: string;
  timestamp: string;
  failedAt: string;
  errorMessage: string;
  errorCode?: string;
  retryable?: boolean;
  meta?: Record<string, unknown>;
}

export interface NexaFxEventPayloadMap {
  'transaction.created': TransactionCreatedEvent;
  'transaction.processing': TransactionProcessingEvent;
  'transaction.completed': TransactionCompletedEvent;
  'transaction.failed': TransactionFailedEvent;
}

export type NexaFxWebhookEvent<TEventType extends NexaFxEventType = NexaFxEventType> = {
  eventType: TEventType;
  payload: NexaFxEventPayloadMap[TEventType];
};

export function isNexaFxEventType(value: string): value is NexaFxEventType {
  return (NEXAFX_EVENT_TYPES as readonly string[]).includes(value);
}

export function parseWebhookEvent<TEventType extends NexaFxEventType>(
  eventType: TEventType,
  payload: unknown,
): NexaFxWebhookEvent<TEventType> {
  if (!isNexaFxEventType(eventType)) {
    throw new Error(`Unsupported NexaFx event type: ${eventType}`);
  }

  return {
    eventType,
    payload: payload as NexaFxEventPayloadMap[TEventType],
  };
}
