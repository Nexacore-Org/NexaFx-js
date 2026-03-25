import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from '../../notifications/services/notification.service';

@Injectable()
export class AlertingService {
  private readonly logger = new Logger(AlertingService.name);

  constructor(private readonly notificationService: NotificationService) {}

  async sendRiskAlert(payload: {
    type: 'EXPOSURE' | 'TRANSACTION_RISK';
    subjectId: string;
    message: string;
    metadata?: Record<string, any>;
  }) {
    // Delegate to notification pipeline (throttled/batched downstream)
    await this.notificationService.send({
      type: `RISK_${payload.type}`,
      payload: {
        subjectId: payload.subjectId,
        message: payload.message,
        metadata: payload.metadata,
      },
    });

    this.logger.log(`Risk alert queued: ${payload.type} ${payload.subjectId}`);
  }
}
