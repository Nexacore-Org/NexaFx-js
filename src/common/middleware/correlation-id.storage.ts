import { AsyncLocalStorage } from 'async_hooks';

export const correlationIdStorage = new AsyncLocalStorage<string>();

export function getCorrelationId(): string | undefined {
  return correlationIdStorage.getStore();
}
