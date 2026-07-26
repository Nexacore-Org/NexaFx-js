import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';
import { AsyncLocalStorage } from 'async_hooks';

export const requestContext = new AsyncLocalStorage<{ userId?: string }>();

@EventSubscriber()
export class AuditFieldsSubscriber implements EntitySubscriberInterface {
  beforeInsert(event: InsertEvent<Record<string, unknown>>): void {
    const ctx = requestContext.getStore();
    if (ctx?.userId) {
      event.entity['createdBy'] = ctx.userId;
      event.entity['updatedBy'] = ctx.userId;
    }
  }

  beforeUpdate(event: UpdateEvent<Record<string, unknown>>): void {
    const ctx = requestContext.getStore();
    if (ctx?.userId && event.entity) {
      event.entity['updatedBy'] = ctx.userId;
    }
  }
}