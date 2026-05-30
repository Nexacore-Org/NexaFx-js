import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditLog } from './audit-log.entity';

export interface AuditEvent {
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
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
    const entry = this.auditRepo.create(event);
    return this.auditRepo.save(entry);
  }

  @OnEvent('audit.**')
  handleAuditEvent(event: AuditEvent): void {
    void this.log(event);
  }
}
