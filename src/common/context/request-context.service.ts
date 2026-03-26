import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

interface Store {
  correlationId: string;
  userId?: string;
}

@Injectable()
export class RequestContextService {
  private readonly als = new AsyncLocalStorage<Store>();

  run(store: Store, callback: () => void) {
    this.als.run(store, callback);
  }

  getStore(): Store | undefined {
    return this.als.getStore();
  }

  getCorrelationId(): string | undefined {
    return this.getStore()?.correlationId;
  }

  getUserId(): string | undefined {
    return this.getStore()?.userId;
  }

  setUserId(userId: string) {
    const store = this.getStore();
    if (store) store.userId = userId;
  }
}