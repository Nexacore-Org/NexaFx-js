import type { DistributedLockService } from './distributed-lock.service';

/**
 * `@ClusterCron` is a method decorator and cannot use Nest DI, so the lock
 * service registers itself here when the module starts. When nothing is
 * registered (unit tests that call the job method directly) jobs run unlocked.
 */
let active: DistributedLockService | undefined;

export function setActiveLockService(service: DistributedLockService | undefined): void {
  active = service;
}

export function getActiveLockService(): DistributedLockService | undefined {
  return active;
}
