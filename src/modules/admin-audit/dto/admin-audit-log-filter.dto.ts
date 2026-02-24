import { ActorType } from '../entities/admin-audit-log.entity';

export class AdminAuditLogFilterDto {
  startDate?: string;
  endDate?: string;
  actorId?: string;
  actorType?: ActorType;
  action?: string;
  entity?: string;
  limit?: number;
  offset?: number;
}
