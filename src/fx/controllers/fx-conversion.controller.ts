import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiCreatedResponse, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { Idempotent } from '../../idempotency/idempotency.decorator';
import { IdempotencyGuard } from '../../idempotency/idempotency.guard';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import { FxConversionService } from '../services/fx-conversion.service';
import {
  ConversionHistoryDto,
  ExecuteConversionDto,
  GetFeesDto,
  GetQuoteDto,
  ReverseConversionDto,
} from '../dto/fx-conversion.dto';
import { OpenDisputeDto } from '../../modules/disputes/dto/dispute.dto';
import { LoyaltyTier } from '../../loyalty-point/loyalty-account.entity';

@ApiTags('FX Conversion')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('fx')
export class FxConversionController {
  constructor(private readonly fxService: FxConversionService) {}

  /**
   * GET /fx/convert/quote?fromCurrency=USD&toCurrency=NGN&fromAmount=10000
   *
   * Returns:
   *  - quoteId (UUID)
   *  - locked effectiveRate, midRate, markupPct
   *  - feeAmount, netFromAmount, toAmount
   *  - ttlSeconds (60)
   *  - regulatoryDisclosure text for the user's jurisdiction
   */
  @Get('convert/quote')
  @ApiOperation({ summary: 'Get a locked FX conversion quote' })
  @ApiOkResponse({ description: 'Quote with locked rate, fees, and TTL' })
  async getQuote(@Request() req, @Query() dto: GetQuoteDto) {
    const user = req.user;
    return this.fxService.createQuote(
      user.id,
      {
        fromCurrency: dto.fromCurrency.toUpperCase(),
        toCurrency:   dto.toCurrency.toUpperCase(),
        fromAmount:   dto.fromAmount,
        tier:         dto.tier,
        feeWaived:    dto.feeWaived,
      },
      user.country ?? null,
    );
  }

  /**
   * POST /fx/convert
   * Executes a conversion at the locked rate.
   * Returns 410 Gone if the quote has expired.
   */
  @Post('convert')
  @HttpCode(HttpStatus.CREATED)
  @Idempotent()
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({ summary: 'Execute a currency conversion at a locked quote rate' })
  @ApiCreatedResponse({ description: 'Conversion executed successfully' })
  @ApiHeader({ name: 'Idempotency-Key', description: 'Unique key to prevent duplicate conversions (min 16 chars)', required: true })
  async executeConversion(@Request() req, @Body() dto: ExecuteConversionDto) {
    return this.fxService.executeConversion(req.user.id, dto);
  }

  /**
   * GET /fx/fees?fromCurrency=USD&toCurrency=NGN&fromAmount=10000
   *
   * Returns a complete cost breakdown including:
   *  - midRate, markupPct, effectiveRate
   *  - feeAmount, feePct
   *  - totalCostPct vs mid-market
   *
   * Does NOT lock a quote — purely informational.
   */
  @Get('fees')
  @ApiOperation({ summary: 'Get FX fee breakdown (informational, no quote lock)' })
  @ApiOkResponse({ description: 'Fee breakdown with mid-rate, markup and total cost' })
  async getFees(@Request() req, @Query() dto: GetFeesDto) {
    return this.fxService.getFeeBreakdown(
      dto.fromCurrency.toUpperCase(),
      dto.toCurrency.toUpperCase(),
      dto.fromAmount,
      dto.tier ?? LoyaltyTier.BRONZE,
    );
  }

  /**
   * GET /fx/convert/history?page=1&limit=20&fromCurrency=USD&toCurrency=NGN
   *
   * Paginated conversion history — newest first.
   */
  @Get('convert/history')
  @ApiOperation({ summary: 'Get paginated FX conversion history' })
  @ApiOkResponse({ description: 'Paginated conversion history' })
  async getHistory(@Request() req, @Query() dto: ConversionHistoryDto) {
    return this.fxService.getHistory(req.user.id, dto);
  }

  /**
   * POST /fx/convert/:id/reverse
   * Reverses a conversion within a 5-minute window.
   */
  @Post('convert/:id/reverse')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reverse a conversion within the 5-minute window' })
  @ApiOkResponse({ description: 'Conversion reversed successfully' })
  async reverseConversion(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: ReverseConversionDto,
  ) {
    return this.fxService.reverseConversion(req.user.id, id, dto.reason);
  }

  /**
   * POST /fx/convert/:id/dispute
   * Opens a dispute for a conversion.
   */
  @Post('convert/:id/dispute')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Open a dispute for a conversion' })
  @ApiCreatedResponse({ description: 'Dispute opened successfully' })
  async openDispute(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: OpenDisputeDto,
  ) {
    return this.fxService.openDispute(req.user.id, id, dto);
  }
}
