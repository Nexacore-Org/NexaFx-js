import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditLog } from './audit-log.entity';
import { maskBody } from '../common/utils/redact';
import { getRequestActorId } from '../common/context/request-actor.storage';

const AUDIT_MASK_DEPTH = 10;

export interface AuditEvent {
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  async log(event: AuditEvent): Promise<AuditLog> {
    // During an impersonated request, every entry also names the real admin.
    const actorId = getRequestActorId();
    if (actorId) {
      event = { ...event, after: { ...(event.after ?? {}), impersonatedBy: actorId } };
    }

    // Never persist secrets/PII into the (exportable) audit trail.
    const entry = repo.create({
      ...event,
      ...(event.before !== undefined && {
        before: maskBody(event.before, 0, AUDIT_MASK_DEPTH) as Record<string, unknown>,
      }),
      ...(event.after !== undefined && {
        after: maskBody(event.after, 0, AUDIT_MASK_DEPTH) as Record<string, unknown>,
      }),
    });
    return repo.save(entry);
  }

  @OnEvent('audit.**')
  handleAuditEvent(event: AuditEvent): void {
    void this.log(event);
  }
}
