// src/modules/incidents/incident.service.ts
import { Injectable } from '@nestjs/common';
import { NotificationService } from '../notifications/notification.service'; // Assume this exists

@Injectable()
export class IncidentService {
  private errorBuffer: number[] = [];
  private readonly ERROR_THRESHOLD = 10;
  private readonly TIME_WINDOW_MS = 60000; // 1 minute

  constructor(private notificationService: NotificationService) {}

  async reportError(error: any) {
    const now = Date.now();
    this.errorBuffer.push(now);
    
    // Clean old errors outside the window
    this.errorBuffer = this.errorBuffer.filter(t => now - t < this.TIME_WINDOW_MS);

    if (this.errorBuffer.length > this.ERROR_THRESHOLD) {
      await this.triggerIncident('ERROR_SPIKE', 'Critical: High error frequency detected!');
    }
  }

  private async triggerIncident(type: string, message: string) {
    // 1. Log to DB
    console.log(`[INCIDENT LOGGED]: ${type} - ${message}`);
    // 2. Alert Admins
    await this.notificationService.sendAlert(message);
  }
}