import { Injectable } from '@nestjs/common';

export interface AdminLogEntry {
  id: string;
  adminId: string;
  action: string;
  details: string;
  timestamp: Date;
}

@Injectable()
export class AdminLogService {
  private logs: AdminLogEntry[] = [];

  async logAction(
    adminId: string,
    action: string,
    details: string,
  ): Promise<AdminLogEntry> {
    const logEntry: AdminLogEntry = {
      id: Date.now().toString(),
      adminId,
      action,
      details,
      timestamp: new Date(),
    };

    this.logs.push(logEntry);
    console.log(`Admin Log: ${adminId} performed ${action} - ${details}`);

    return logEntry;
  }

  async getLogs(): Promise<AdminLogEntry[]> {
    return this.logs;
  }

  async getLogsByAdmin(adminId: string): Promise<AdminLogEntry[]> {
    return this.logs.filter((log) => log.adminId === adminId);
  }
}
