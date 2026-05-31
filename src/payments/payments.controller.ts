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
}
