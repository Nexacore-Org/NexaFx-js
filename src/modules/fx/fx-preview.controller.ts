import { Controller, Get, Query, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { FxQuoteCache } from '../../fx/fx-quote-cache';
import { ExchangeRateService } from '../../fx/exchange-rate.service';

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
@Controller('fx')
@UseGuards(JwtAuthGuard)
export class FxPreviewController {
  constructor(private readonly exchangeRates: ExchangeRateService) {}

  @Get('preview')
  async getPreview(
    @Req() req: { user?: { id?: string; sub?: string } },
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('amount') amount: string,
  ): Promise<FxPreviewResponse> {
    const userId = req.user?.id ?? req.user?.sub;
    if (!userId) {
      throw new BadRequestException('An authenticated user is required to lock a quote');
    }
    const fromAmount = parseFloat(amount ?? '0');
    // Live rate from ExchangeRateService instead of a random number (issue #1395).
    const rate = from === to ? 1.0 : (await this.exchangeRates.getRate(from, to)).rate;
    const fee = parseFloat((fromAmount * 0.005).toFixed(8));
    const toAmount = parseFloat(((fromAmount - fee) * rate).toFixed(8));
    // The quote is bound to this user, pair and amount, has a random UUID id
    // and can be redeemed once.
    const { quoteId, expiresAt } = await FxQuoteCache.create({
      userId,
      fromCurrency: from ?? '',
      toCurrency: to ?? '',
      fromAmount,
      rate,
    });

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
