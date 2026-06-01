import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WalletsService } from './wallets.service';

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
}
