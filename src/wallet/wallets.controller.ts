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
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('wallets')
@ApiBearerAuth()
@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly auditService: AuditService,
  ) {}

  // #1425: 'me' is declared before any param route and always resolves to the
  // caller's own account — never a client-supplied accountId.
  @Get('me')
  @ApiOperation({ summary: 'Get balances for the authenticated user' })
  @ApiOkResponse({ description: 'Account balances returned successfully' })
  getBalances(@CurrentUser('sub') userId: string) {
    return this.walletsService.getBalancesForAccount(userId);
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

  @Post('me/auto-sweep/config')
  setAutoSweepConfig(
    @CurrentUser('sub') userId: string,
    @Body() body: { threshold: number; coldStorageAddress: string },
  ) {
    return this.walletsService.setAutoSweepConfig(userId, body.threshold, body.coldStorageAddress);
  }

  @Post('me/auto-sweep/process')
  processAutoSweep(
    @CurrentUser('sub') userId: string,
    @Body() body: { currency: string },
  ) {
    return this.walletsService.processAutoSweep(userId, body.currency);
  }

  @Post('me/:currency/customize')
  updateCustomization(
    @CurrentUser('sub') userId: string,
    @Param('currency') currency: string,
    @Body() body: { label?: string; color?: string }
  ) {
    return this.walletsService.updateCustomization(userId, currency, body.label, body.color);
  }
}
