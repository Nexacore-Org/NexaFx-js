import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { WalletsService } from './wallets.service';
import { AdjustBalanceDto } from './dto/adjust-balance.dto';

@ApiTags('wallets')
@ApiBearerAuth()
@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get(':accountId')
  @ApiOperation({ summary: 'Get balances for an account' })
  @ApiOkResponse({ description: 'Account balances returned successfully' })
  getBalances(@Param('accountId') accountId: string) {
    return this.walletsService.getBalancesForAccount(accountId);
  }

  @Post('adjust-balance')
  adjustBalance(@Body() dto: AdjustBalanceDto) {
    return this.walletsService.adjustBalance(
      dto.accountId,
      dto.currency,
      dto.delta,
    );
  }

  @Post('auto-sweep/config')
  setAutoSweepConfig(@Body() body: { userId: string; threshold: number; coldStorageAddress: string }) {
    return this.walletsService.setAutoSweepConfig(body.userId, body.threshold, body.coldStorageAddress);
  }

  @Post('auto-sweep/process')
  processAutoSweep(@Body() body: { userId: string; currency: string }) {
    return this.walletsService.processAutoSweep(body.userId, body.currency);
  }

  @Post(':accountId/:currency/customize')
  updateCustomization(
    @Param('accountId') accountId: string,
    @Param('currency') currency: string,
    @Body() body: { label?: string; color?: string }
  ) {
    return this.walletsService.updateCustomization(accountId, currency, body.label, body.color);
  }
}
