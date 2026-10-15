import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { WalletsService } from './wallets.service';
import { AdjustBalanceDto } from './dto/adjust-balance.dto';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { AuditService } from '../audit/audit.service';

@ApiTags('wallets')
@ApiBearerAuth()
@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly auditService: AuditService,
  ) {}

  @Get(':accountId')
  @ApiOperation({ summary: 'Get balances for an account' })
  @ApiOkResponse({ description: 'Account balances returned successfully' })
  getBalances(@Param('accountId') accountId: string) {
    return this.walletsService.getBalancesForAccount(accountId);
  }

  // Direct balance adjustment bypasses transaction/fee/ledger flows, so it is
  // restricted to admins and every use is recorded against the acting admin.
  @Post('adjust-balance')
  @UseGuards(AdminRoleGuard)
  @ApiOperation({ summary: 'Admin: adjust an account balance' })
  async adjustBalance(
    @Body() dto: AdjustBalanceDto,
    @Req() req: { user?: { sub?: string; id?: string } },
  ) {
    const result = await this.walletsService.adjustBalance(
      dto.accountId,
      dto.currency,
      dto.delta,
    );

    await this.auditService.log({
      userId: req.user?.sub ?? req.user?.id,
      action: 'wallet.balance_adjusted',
      entityType: 'wallet',
      entityId: dto.accountId,
      after: {
        accountId: dto.accountId,
        currency: dto.currency,
        delta: dto.delta,
        resultingBalance: result?.balance,
      },
    });

    return result;
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
