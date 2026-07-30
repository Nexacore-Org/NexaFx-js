import { Controller, Post, Get, Body, Param, Query, Headers, RawBodyRequest, Req } from '@nestjs/common';
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

  @Post('invoices')
  createInvoice(@Body() dto: { userId: string; clientName: string; currency: string; items: any[]; totalAmount: number }) {
    return this.paymentProviderService.createInvoice(dto);
  }

  @Get('invoices/:id')
  getInvoice(@Param('id') id: string) {
    return this.paymentProviderService.getInvoice(id);
  }

  @Post('recurring')
  scheduleRecurringPayment(@Body() dto: { userId: string; recipient: string; amount: number; currency: string; frequency: string }) {
    return this.paymentProviderService.scheduleRecurringPayment(dto);
  }

  @Get('recurring')
  getRecurringPayments(@Query('userId') userId: string) {
    return this.paymentProviderService.getRecurringPayments(userId);
  }

  @Post('merchant/process')
  processMerchantPayment(@Body() dto: { merchantId: string; customerId: string; amount: number; currency: string; orderId: string }) {
    return this.paymentProviderService.processMerchantPayment(dto);
  }
}
