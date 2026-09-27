// DECISION (issue #1305): not yet registered in app.module.ts.
// Verified PaymentsController has no @UseGuards on any route: webhook
// signature verification IS implemented (see handleWebhook), but there
// is no auth guard or userId-ownership check on getInvoice(id) or
// getRecurringPayments(userId) — either endpoint currently lets any
// caller supply any id/userId and read another user's payment data.
// Do not import this module into app.module.ts until an auth guard plus
// an ownership check (caller's authenticated userId matches the
// resource) are added to those two routes.
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentProviderService } from './payment-provider.service';
import { PaymentsController } from './payments.controller';

@Module({
  imports: [ConfigModule],
  controllers: [PaymentsController],
  providers: [PaymentProviderService],
  exports: [PaymentProviderService],
})
export class PaymentsModule {}
