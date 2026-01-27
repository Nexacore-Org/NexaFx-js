export class AdminAuditLogFilterDto {
  startDate?: string;
  endDate?: string;
  adminId?: string;
  action?: string;
  limit?: number;
  offset?: number;
}
