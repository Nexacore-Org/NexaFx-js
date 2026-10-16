import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccountClosureService } from './account-closure.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CloseAccountDto } from './dto/close-account.dto';

@ApiTags('Users')
@UseGuards(JwtAuthGuard)
@Controller('users/me')
export class AccountClosureController {
  constructor(private readonly accountClosureService: AccountClosureService) {}

  @Post('close-account')
  async closeAccount(
    @CurrentUser('id') userId: string,
    @Body() dto: CloseAccountDto,
  ): Promise<{ closed: true; deletedAt: Date; piiPurgeAt: Date }> {
    // Identity comes from the global JWT guard, never from a re-parsed header.
    return this.accountClosureService.closeAccount(userId, dto.currentPassword);
  }

  @Get('export-data')
  exportData(@Req() req: { user: { sub: string } }) {
    const userId = req.user.sub;
    return {
      exportId: `exp_${Date.now()}_${userId?.slice(0, 6) ?? 'usr'}`,
      requestedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 48 * 3600_000).toISOString(),
      sections: ['profile', 'wallets', 'transactions', 'notification_preferences', 'audit_logs'],
    };
  }
}
