import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { RetryModule } from './modules/retry/retry.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { EnrichmentModule } from './modules/enrichment/enrichment.module';

@Module({
  imports: [
    NotificationsModule,
    WebhooksModule,
    RetryModule,
    SessionsModule,
    TransactionsModule,
    EnrichmentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
