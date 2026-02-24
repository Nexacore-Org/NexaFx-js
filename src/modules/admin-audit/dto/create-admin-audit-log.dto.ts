import { ActorType } from '../entities/admin-audit-log.entity';

export class CreateAdminAuditLogDto {
  actorId?: string;
  actorType?: ActorType;
  action: string;
  entity?: string;
  entityId?: string;
  beforeSnapshot?: Record<string, any>;
  afterSnapshot?: Record<string, any>;
  metadata?: Record<string, any>;
  ip?: string;
  userAgent?: string;
  description?: string;
}
