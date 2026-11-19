import { Cron, CronOptions } from '@nestjs/schedule';
import { getActiveLockService } from './lock-registry';

export const DEFAULT_CLUSTER_CRON_TTL_MS = 5 * 60 * 1000;

export interface ClusterCronOptions extends CronOptions {
  /** Lock lifetime. Must exceed the job's worst-case runtime; defaults to 5 minutes. */
  ttlMs?: number;
  heartbeatMs?: number;
  /**
   * The job only touches this instance's own resources (e.g. local disk), so it
   * must run on every replica instead of once per tick. Skips the lock; use
   * sparingly and say why at the call site.
   */
  perInstance?: boolean;
}

/**
 * `@Cron` that runs on one replica per tick (issue #1550). Every scheduled job
 * must use this instead of a bare `@Cron(`; `npm run check:cron` enforces it.
 *
 * `lockKey` should be unique per job, e.g. `reconciliation:ledger`.
 */
export function ClusterCron(
  expression: string,
  lockKey: string,
  options: ClusterCronOptions = {},
): MethodDecorator {
  const {
    ttlMs = DEFAULT_CLUSTER_CRON_TTL_MS,
    heartbeatMs,
    perInstance = false,
    ...cronOptions
  } = options;

  return (target, propertyKey, descriptor: PropertyDescriptor) => {
    const original = descriptor.value as (...args: unknown[]) => unknown;

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const locks = getActiveLockService();
      if (perInstance || !locks) {
        return original.apply(this, args);
      }
      const body = () => original.apply(this, args);
      const outcome = heartbeatMs
        ? await locks.runExclusive(lockKey, ttlMs, body, { heartbeatMs })
        : await locks.runExclusive(lockKey, ttlMs, body);
      return outcome.ran ? outcome.result : undefined;
    };

    // Cron() stores its metadata on descriptor.value, so it must be applied to the wrapper.
    Cron(expression, cronOptions)(target, propertyKey, descriptor);
  };
}
