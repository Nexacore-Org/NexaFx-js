import {
  BadRequestException,
  Body,
  Controller,
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
}
