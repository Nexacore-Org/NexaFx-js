import { Injectable, Logger } from "@nestjs/common";

export type AuditAction = "account_lock" | "lock_release" | "rate_limit_violation" | "transaction_high_risk";

export interface AuditLog {
  userId: string;
  action: AuditAction;
  timestamp: Date;
  details?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);
  private logs: AuditLog[] = [];

  log(userId: string, action: AuditAction, details?: string) {
    const entry: AuditLog = {
      userId,
      action,
      timestamp: new Date(),
      details,
    };
    this.logs.push(entry);
    this.logger.log(`Audit log: ${action} for user ${userId} - ${details || ""}`);
  }

  getUserLogs(userId: string): AuditLog[] {
    return this.logs.filter((l) => l.userId === userId);
  }
}
