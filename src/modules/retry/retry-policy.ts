import { RetryErrorCategory } from './entities/retry-job.entity';

export type RetryPolicy = {
  retryable: boolean;
  maxAttempts: number;
  // backoff in seconds
  backoff: (attempt: number) => number;
};

export function getRetryPolicy(category: RetryErrorCategory): RetryPolicy {
  // exponential backoff: 1m, 2m, 4m, 8m... capped later
  const exponentialBackoff = (attempt: number) =>
    Math.min(60 * 60, 60 * Math.pow(2, attempt));

  switch (category) {
    case 'NETWORK_TIMEOUT':
    case 'PROVIDER_TEMPORARY_FAILURE':
      return { retryable: true, maxAttempts: 6, backoff: exponentialBackoff };

    case 'PROVIDER_RATE_LIMIT':
      return {
        retryable: true,
        maxAttempts: 8,
        backoff: (a) => Math.min(60 * 60, 120 * (a + 1)),
      };

    case 'INSUFFICIENT_FUNDS':
    case 'INVALID_RECIPIENT':
    case 'DUPLICATE_REQUEST':
      return { retryable: false, maxAttempts: 0, backoff: () => 0 };

    default:
      return { retryable: true, maxAttempts: 4, backoff: exponentialBackoff };
  }
}
