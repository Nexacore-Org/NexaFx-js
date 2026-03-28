import { Injectable, Logger } from '@nestjs/common';
import { NotificationOrchestratorService } from '../../modules/notifications/services/notification-orchestrator.service';

const DLQ_ALERT_USER_ID = 'system-admin';

@Injectable()
export class DlqAlertingService {
  private readonly logger = new Logger(DlqAlertingService.name);

  constructor(private readonly orchestrator: NotificationOrchestratorService) {}

  async sendDlqAlert(payload: {
    originalQueue: string;
    originalJobName: string;
    failureReason: string;
    failedAt: string;
    attemptsMade: number;
    idempotencyKey: string;
  }): Promise<void> {
    await this.orchestrator.notify({
      userId: DLQ_ALERT_USER_ID,
      type: 'system.dlq_alert',
      title: 'Dead-Letter Queue Alert',
      body: `Job "${payload.originalJobName}" from queue "${payload.originalQueue}" dead-lettered after ${payload.attemptsMade} attempts. Reason: ${payload.failureReason}`,
      urgency: 'critical',
      payload,
    });
    this.logger.log(
      `DLQ alert sent for job "${payload.originalJobName}" from "${payload.originalQueue}"`,
    );
  }
}
