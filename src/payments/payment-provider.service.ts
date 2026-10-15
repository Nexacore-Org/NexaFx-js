import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'crypto';

@Injectable()
export class PaymentProviderService {
  private readonly logger = new Logger(PaymentProviderService.name);

  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    const secret = this.config.get<string>('PROVIDER_WEBHOOK_SECRET');
    if (!secret) {
      throw new Error(
        '[STARTUP BLOCKED] PROVIDER_WEBHOOK_SECRET is not configured. ' +
          'Set it in your environment variables before starting the server.',
      );
    }
    this.webhookSecret = secret;
  }

  async initiateDeposit(
    userId: string,
    amount: number,
    currency: string,
  ): Promise<{ reference: string; paymentUrl: string }> {
    const reference = `dep_${Date.now()}_${userId.slice(0, 8)}`;
    const baseUrl = this.config.get<string>('PROVIDER_API_URL', '');
    this.logger.log(
      `Initiating deposit: user=${userId} amount=${amount} ${currency} ref=${reference}`,
    );
    return { reference, paymentUrl: `${baseUrl}/pay?ref=${reference}` };
  }

  verifyWebhook(payload: string, signature: string): boolean {
    const expected = createHmac('sha256', this.webhookSecret).update(payload).digest('hex');
    // Hash both values to fixed-length digests so differing lengths never reach
    // timingSafeEqual (which throws) and no early-exit path leaks timing.
    const expectedDigest = createHash('sha256').update(expected).digest();
    const providedDigest = createHash('sha256').update(String(signature ?? '')).digest();
    return timingSafeEqual(expectedDigest, providedDigest);
  }

  async processDeposit(event: Record<string, unknown>): Promise<void> {
    this.logger.log(`Processing deposit webhook event: ${JSON.stringify(event)}`);
  }

  private readonly invoices = new Map<string, any>();
  private readonly recurringPayments = new Map<string, any[]>();

  createInvoice(dto: { userId: string; clientName: string; currency: string; items: any[]; totalAmount: number }) {
    const id = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const invoice = {
      id,
      ...dto,
      status: 'UNPAID',
      createdAt: new Date().toISOString(),
    };
    this.invoices.set(id, invoice);
    return invoice;
  }

  getInvoice(id: string) {
    return this.invoices.get(id) || null;
  }

  scheduleRecurringPayment(dto: { userId: string; recipient: string; amount: number; currency: string; frequency: string }) {
    const id = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const schedule = {
      id,
      ...dto,
      active: true,
      createdAt: new Date().toISOString(),
    };
    const userSchedules = this.recurringPayments.get(dto.userId) || [];
    userSchedules.push(schedule);
    this.recurringPayments.set(dto.userId, userSchedules);
    return schedule;
  }

  getRecurringPayments(userId: string) {
    return this.recurringPayments.get(userId) || [];
  }

  processMerchantPayment(dto: { merchantId: string; customerId: string; amount: number; currency: string; orderId: string }) {
    this.logger.log(`Processing merchant payment: ${JSON.stringify(dto)}`);
    return {
      transactionId: `tx_merch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      status: 'COMPLETED',
      ...dto,
      processedAt: new Date().toISOString(),
    };
  }
}
