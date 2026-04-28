import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RateProviderService } from './rate-provider.service';
import { AdminAuditService } from '../../modules/admin-audit/admin-audit.service';
import { NotificationService } from '../../modules/notifications/services/notification.service';

@Injectable()
export class FxSlaAlertCron {
  private readonly logger = new Logger(FxSlaAlertCron.name);

  constructor(
    private readonly rateProvider: RateProviderService,
    private readonly auditService: AdminAuditService,
    private readonly notificationService: NotificationService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkProviderSla() {
    this.logger.debug('Running FX Rate Provider SLA check...');
    
    const threshold = 5;
    const failingProviders = await this.rateProvider.getProvidersWithHighFailures(threshold);
    
    if (failingProviders.length > 0) {
      this.logger.warn(`SLA Breach detected for FX providers: ${failingProviders.join(', ')}`);
      
      for (const provider of failingProviders) {
        // 1. Log to admin audit
        await this.auditService.logSystemEvent(
          'FX_PROVIDER_SLA_BREACH',
          'RateProvider',
          `Provider ${provider} has exceeded ${threshold} consecutive failures.`,
          { provider, consecutiveFailures: threshold },
        );
        
        // 2. Emit notification
        try {
          await this.notificationService.send({
            type: 'FX_PROVIDER_SLA_ALERT',
            payload: {
              provider,
              threshold,
              severity: 'CRITICAL',
              message: `FX Rate Provider ${provider} is failing SLA. Consecutive failures >= ${threshold}.`,
            },
          });
        } catch (error) {
          this.logger.error(`Failed to send SLA notification: ${error.message}`);
        }
      }
    }
  }
}
