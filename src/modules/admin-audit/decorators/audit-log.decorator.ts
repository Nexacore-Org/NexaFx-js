import { SetMetadata } from '@nestjs/common';

export interface AuditLogOptions {
  action: string;
  entity: string;
  entityIdParam?: string;
  description?: string;
  skipFields?: string[];
  maskFields?: string[];
}

export const AUDIT_LOG_KEY = 'audit_log';

export const AuditLog = (options: AuditLogOptions) =>
  SetMetadata(AUDIT_LOG_KEY, options);
