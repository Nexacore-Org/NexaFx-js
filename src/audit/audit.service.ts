import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditLog } from './audit-log.entity';
import { maskBody } from '../common/utils/redact';
import { getRequestActorId } from '../common/context/request-actor.storage';

const AUDIT_MASK_DEPTH = 10;
/** Audit snapshots keep `email` readable (admin actions name the user); all other PII is masked. */
const AUDIT_MASK_OPTIONS = { keepFields: ['email'] };

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
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  /**
   * Writes one audit entry. Pass the caller's `manager` to make the entry part of
   * the caller's transaction (it commits or rolls back with the business change);
   * without one it uses the shared repository (issue #1517).
   */
  async log(event: AuditEvent, manager?: EntityManager): Promise<AuditLog> {
    // During an impersonated request, every entry also names the real admin. Work on a
    // copy: the caller's event object is never mutated.
    const actorId = getRequestActorId();
    const enriched: AuditEvent = actorId
      ? { ...event, after: { ...(event.after ?? {}), impersonatedBy: actorId } }
      : event;

    const repo = manager ? manager.getRepository(AuditLog) : this.auditRepo;

    // Never persist secrets/PII into the (exportable) audit trail. before/after are masked
    // exactly once, after enrichment, and always replace whatever the event carried.
    const { before, after, ...rest } = enriched;
    const entry = repo.create({
      ...rest,
      ...(before !== undefined && {
        before: maskBody(before, 0, AUDIT_MASK_DEPTH) as Record<string, unknown>,
    // Never persist secrets/PII into the (exportable) audit trail.
    const entry = this.auditRepo.create({
      ...event,
      ...(event.before !== undefined && {
        before: maskBody(event.before, 0, AUDIT_MASK_DEPTH, AUDIT_MASK_OPTIONS) as Record<string, unknown>,
      }),
      ...(event.after !== undefined && {
        after: maskBody(event.after, 0, AUDIT_MASK_DEPTH, AUDIT_MASK_OPTIONS) as Record<string, unknown>,
      ...(after !== undefined && {
        after: maskBody(after, 0, AUDIT_MASK_DEPTH) as Record<string, unknown>,
      }),
    });
    return repo.save(entry);
  }

  @OnEvent('audit.**')
  handleAuditEvent(event: AuditEvent): void {
    // Event listeners have no caller to report to, and an unhandled rejection
    // crashes the process on Node 15+. A failed insert is logged, never thrown.
    this.log(event).catch((err: unknown) => {
      this.logger.error(
        `Failed to persist audit event "${event.action}" for ${event.entityType}: ${(err as Error)?.message ?? err}`,
      );
    });
  }
}
