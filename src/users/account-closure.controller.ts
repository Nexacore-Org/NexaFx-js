import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AccountClosureService } from './account-closure.service';

@ApiTags('Users')
@Controller('users/me')
export class AccountClosureController {
  constructor(private readonly accountClosureService: AccountClosureService) {}

  @Post('close-account')
  async closeAccount(
    @Headers('authorization') authorization: string | undefined,
    @Body('currentPassword') currentPassword: string,
    @Body('twoFactorCode') twoFactorCode: string,
  ): Promise<{ closed: true; deletedAt: Date; piiPurgeAt: Date }> {
    const accessToken = this.extractBearerToken(authorization);
    return this.accountClosureService.closeAccount(
      accessToken,
      currentPassword,
      twoFactorCode,
    );
  }

  private extractBearerToken(authorization: string | undefined): string {
    if (!authorization?.startsWith('Bearer ')) {
      throw new BadRequestException('Bearer access token is required');
    }

    const token = authorization.slice('Bearer '.length).trim();
    if (!token) {
      throw new BadRequestException('Bearer access token is required');
    }

    return token;
  }

  @Get('export-data')
  exportData(@Headers('x-user-id') userId: string) {
    return {
      exportId: `exp_${Date.now()}_${userId?.slice(0, 6) ?? 'usr'}`,
      requestedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 48 * 3600_000).toISOString(),
      sections: ['profile', 'wallets', 'transactions', 'notification_preferences', 'audit_logs'],
    };
  }
}
