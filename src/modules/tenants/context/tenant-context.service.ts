import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

@Injectable()
export class TenantContextService {
  private static readonly storage = new AsyncLocalStorage<string>();

  run<T>(tenantId: string, callback: () => T) {
    return TenantContextService.storage.run(tenantId, callback);
  }

  getTenantId(): string | undefined {
    return TenantContextService.storage.getStore();
  }

  // Ensures isolation at the service/repo layer
  getTenantIdOrFail(): string {
    const id = this.getTenantId();
    if (!id) throw new Error('Tenant context missing');
    return id;
  }

  attachToJob<T extends Record<string, any>>(data: T): T & { tenantId?: string } {
    return { ...data, tenantId: this.getTenantId() };
  }

  runFromJob<T>(job: { data?: { tenantId?: string } }, callback: () => T) {
    const tenantId = job.data?.tenantId;
    return tenantId ? this.run(tenantId, callback) : callback();
  }
}
