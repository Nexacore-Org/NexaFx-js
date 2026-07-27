import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

@Injectable()
export class PaymentProviderService {
  private readonly logger = new Logger(PaymentProviderService.name);

  constructor(private readonly config: ConfigService) {}

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
    const secret = this.config.get<string>('PROVIDER_WEBHOOK_SECRET', 'secret');
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    return expected === signature;
  }

  async processDeposit(event: Record<string, unknown>): Promise<void> {
    this.logger.log(`Processing deposit webhook event: ${JSON.stringify(event)}`);
  }

  async processBankWithdrawal(dto: { userId: string; amount: number; currency: string; bankCode: string; accountNumber: string }) {
    const reference = `offramp_${Date.now()}_${dto.userId.slice(0, 6)}`;
    this.logger.log(`Processing bank withdrawal: user=${dto.userId} amount=${dto.amount} bank=${dto.bankCode}`);
    return {
      reference,
      status: 'PROCESSING',
      estimatedSettlementMinutes: 30,
      accountNumberMasked: `****${dto.accountNumber.slice(-4)}`,
    };
  }

  async processCardOnRamp(dto: { userId: string; amount: number; currency: string; cardToken?: string }) {
    const reference = `onramp_${Date.now()}_${dto.userId.slice(0, 6)}`;
    this.logger.log(`Processing card on-ramp: user=${dto.userId} amount=${dto.amount} ${dto.currency}`);
    return {
      reference,
      status: 'SUCCESS',
      redirectUrl: `https://checkout.nexafx.com/pay/${reference}`,
    };
  }
}
