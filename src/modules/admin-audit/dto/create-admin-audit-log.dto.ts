export class CreateAdminAuditLogDto {
  adminId?: string;
  action: string;
  entity?: string;
  entityId?: string;
  metadata?: Record<string, any>;
  ip?: string;
}
