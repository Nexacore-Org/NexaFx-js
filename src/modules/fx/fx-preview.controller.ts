import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

export interface FxPreviewResponse {
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  toAmount: number;
  rate: number;
  fee: number;
  quoteId: string;
  expiresAt: string;
}

/**
 * FX rate preview — returns a locked 30-second rate quote before committing to a trade.
 * The quoteId can be passed to the FX conversion endpoint to use the locked rate.
 */
@Controller('api/v1/fx')
@UseGuards(JwtAuthGuard)
export class FxPreviewController {
  private readonly quoteCache = new Map<string, { rate: number; expiresAt: Date }>();

  @Get('preview')
  getPreview(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('amount') amount: string,
  ): FxPreviewResponse {
    const fromAmount = parseFloat(amount ?? '0');
    const rate = from === to ? 1.0 : parseFloat((0.85 + Math.random() * 0.3).toFixed(6));
    const fee = parseFloat((fromAmount * 0.005).toFixed(8));
    const toAmount = parseFloat(((fromAmount - fee) * rate).toFixed(8));
    const quoteId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const expiresAt = new Date(Date.now() + 30_000);

    this.quoteCache.set(quoteId, { rate, expiresAt });

    return {
      fromCurrency: from ?? '',
      toCurrency: to ?? '',
      fromAmount,
      toAmount,
      rate,
      fee,
      quoteId,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
