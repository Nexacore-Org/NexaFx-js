import { RetryErrorCategory } from './entities/retry-job.entity';

export type RetryPolicy = {
  retryable: boolean;
  maxAttempts: number;
  backoff: (attempt: number) => number; // seconds
};

const exponentialBackoff = (attempt: number) =>
  Math.min(3600, 60 * Math.pow(2, attempt));

const TYPE_POLICIES: Record<string, RetryPolicy> = {
  'transfer.retry':    { retryable: true, maxAttempts: 6, backoff: exponentialBackoff },
  'payment.retry':     { retryable: true, maxAttempts: 5, backoff: exponentialBackoff },
  'deposit.retry':     { retryable: true, maxAttempts: 4, backoff: exponentialBackoff },
  'withdrawal.retry':  { retryable: true, maxAttempts: 4, backoff: exponentialBackoff },
};

export function getRetryPolicyForType(type: string): RetryPolicy | undefined {
  return TYPE_POLICIES[type];
}

export function getRetryPolicy(category: RetryErrorCategory): RetryPolicy {
  switch (category) {
    case 'NETWORK_TIMEOUT':
    case 'PROVIDER_TEMPORARY_FAILURE':
      return { retryable: true, maxAttempts: 6, backoff: exponentialBackoff };

    case 'PROVIDER_RATE_LIMIT':
      return { retryable: true, maxAttempts: 8, backoff: (a) => Math.min(3600, 120 * (a + 1)) };

    case 'INSUFFICIENT_FUNDS':
    case 'INVALID_RECIPIENT':
    case 'DUPLICATE_REQUEST':
      return { retryable: false, maxAttempts: 0, backoff: () => 0 };

    default:
      return { retryable: true, maxAttempts: 4, backoff: exponentialBackoff };
  }
}
