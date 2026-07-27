import { Controller, Post, Body, Headers, RawBodyRequest, Req } from '@nestjs/common';
import { PaymentProviderService } from './payment-provider.service';

@Controller('api/v1/payments')
export class PaymentsController {
  constructor(private readonly paymentProviderService: PaymentProviderService) {}

  @Post('webhook')
  async handleWebhook(
    @Body() body: Record<string, unknown>,
    @Headers('x-provider-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody = (req as any).rawBody ?? JSON.stringify(body);
    const isValid = this.paymentProviderService.verifyWebhook(
      typeof rawBody === 'string' ? rawBody : rawBody.toString(),
      signature ?? '',
    );
    if (!isValid) {
      return { received: false, reason: 'invalid signature' };
    }
    await this.paymentProviderService.processDeposit(body);
    return { received: true };
  }

  @Get('recurring')
  getRecurringPayments(@Query('userId') userId: string) {
    return this.paymentProviderService.getRecurringPayments(userId);
  }

  @Post('bank-withdraw')
  processBankWithdrawal(@Body() dto: { userId: string; amount: number; currency: string; bankCode: string; accountNumber: string }) {
    return this.paymentProviderService.processBankWithdrawal(dto);
  }

  @Post('card-onramp')
  processCardOnRamp(@Body() dto: { userId: string; amount: number; currency: string; cardToken?: string }) {
    return this.paymentProviderService.processCardOnRamp(dto);
  }
}
